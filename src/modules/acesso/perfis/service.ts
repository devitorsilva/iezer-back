import type { RequestContext } from "../../../lib/access.js";
import { AppError } from "../../../lib/errors.js";
import { factoryPermissionKeys, isPermissionKey, normalizePermissions } from "../permissoes/catalog/index.js";
import { assertCanChangeKeys, runGuarded } from "../travas.js";
import type { AccessProfileRepository, AccessProfileWithPermissions } from "./repository.js";
import type { AccessProfileBody, DeleteAccessProfileInput } from "./schemas.js";

export class AccessProfileNotFoundError extends Error {
  constructor() {
    super("ACCESS_PROFILE_NOT_FOUND");
  }
}

function mapProfile(profile: AccessProfileWithPermissions) {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    factoryKey: profile.factoryKey,
    permissions: profile.permissions.map(({ permissionKey }) => permissionKey).sort(),
    // Usuários distintos (RF-PF01) e convites pendentes que também usam o perfil.
    userCount: new Set(profile.assignments.map(({ userId }) => userId)).size,
    inviteCount: new Set(profile.inviteAssignments.map(({ inviteId }) => inviteId)).size,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

type AccessProfileDto = ReturnType<typeof mapProfile>;

const auditView = (profile: AccessProfileDto) => ({
  name: profile.name,
  description: profile.description,
  permissions: profile.permissions.filter(isPermissionKey),
});

const nameTakenError = () =>
  new AppError(409, "PROFILE_NAME_TAKEN", "Já existe um perfil com esse nome.", { field: "name" });

// Perfis de acesso (RF-PF01 a RF-PF04) com as travas de protegidas e de último admin (RT-AB07).
// Toda alteração vale na próxima requisição de quem usa o perfil.
export class AccessProfileService {
  constructor(private readonly repository: AccessProfileRepository) {}

  async list(churchId: string) {
    const profiles = await this.repository.findAll(churchId);
    return profiles.map(mapProfile);
  }

  async create(context: RequestContext, input: AccessProfileBody) {
    const data = this.prepare(input);
    assertCanChangeKeys(data.permissions, context.permissions);

    return runGuarded(context.actor, context.churchId, async (tx, audit) => {
      if (await this.repository.nameTaken(context.churchId, data.name, undefined, tx)) throw nameTakenError();

      const { id } = await this.repository.create(context.churchId, data, tx);
      const created = mapProfile((await this.repository.findById(id, context.churchId, tx))!);

      await audit({
        organizationId: context.churchId,
        module: "ACESSO",
        action: "criar_perfil",
        targetType: "AccessProfile",
        targetId: id,
        after: auditView(created),
      });

      return created;
    });
  }

  async update(context: RequestContext, id: string, input: AccessProfileBody) {
    const data = this.prepare(input);

    return runGuarded(context.actor, context.churchId, async (tx, audit) => {
      const profile = await this.repository.findById(id, context.churchId, tx);
      if (!profile) throw new AccessProfileNotFoundError();

      const before = mapProfile(profile);
      assertCanChangeKeys(data.permissions.filter((key) => !before.permissions.includes(key)), context.permissions);
      assertCanChangeKeys(
        before.permissions.filter((key) => !data.permissions.includes(key)),
        context.permissions,
        "retirar",
      );

      if (await this.repository.nameTaken(context.churchId, data.name, id, tx)) throw nameTakenError();

      await this.repository.update(id, data, tx);
      const after = mapProfile((await this.repository.findById(id, context.churchId, tx))!);

      await audit({
        organizationId: context.churchId,
        module: "ACESSO",
        action: "editar_perfil",
        targetType: "AccessProfile",
        targetId: id,
        before: auditView(before),
        after: auditView(after),
      });

      return after;
    });
  }

  // Restaurar padrão (RF-PF03, RT-AB06): volta as permissões de fábrica e mantém o nome.
  async restore(context: RequestContext, id: string) {
    return runGuarded(context.actor, context.churchId, async (tx, audit) => {
      const profile = await this.repository.findById(id, context.churchId, tx);
      if (!profile) throw new AccessProfileNotFoundError();

      if (!profile.factoryKey) {
        throw new AppError(400, "NOT_FACTORY_PROFILE", "Só perfis de fábrica podem ser restaurados ao padrão.");
      }

      const before = mapProfile(profile);
      const target = factoryPermissionKeys(profile.factoryKey);

      assertCanChangeKeys(target.filter((key) => !before.permissions.includes(key)), context.permissions);
      assertCanChangeKeys(
        before.permissions.filter((key) => !(target as string[]).includes(key)),
        context.permissions,
        "retirar",
      );

      // Chaves fora do catálogo atual somem na restauração.
      await this.repository.replacePermissions(id, target, tx);
      const after = mapProfile((await this.repository.findById(id, context.churchId, tx))!);

      await audit({
        organizationId: context.churchId,
        module: "ACESSO",
        action: "restaurar_perfil",
        targetType: "AccessProfile",
        targetId: id,
        before: auditView(before),
        after: auditView(after),
      });

      return after;
    });
  }

  // Excluir (RF-PF04): perfil de fábrica não sai (é restaurável e o seed o recriaria); com
  // usuários ou convites pendentes, pede o perfil de destino.
  async delete(context: RequestContext, id: string, input: DeleteAccessProfileInput) {
    await runGuarded(context.actor, context.churchId, async (tx, audit) => {
      const profile = await this.repository.findById(id, context.churchId, tx);
      if (!profile) throw new AccessProfileNotFoundError();

      if (profile.factoryKey) {
        throw new AppError(
          409,
          "FACTORY_PROFILE",
          "Perfis de fábrica não podem ser excluídos. Edite as permissões ou restaure o padrão.",
        );
      }

      const before = mapProfile(profile);
      const inUse = before.userCount > 0 || before.inviteCount > 0;
      let target: AccessProfileDto | null = null;

      if (inUse) {
        if (!input.moveToProfileId) {
          throw new AppError(409, "PROFILE_IN_USE", "Este perfil tem usuários. Escolha para qual perfil movê-los.", {
            field: "moveToProfileId",
          });
        }
        if (input.moveToProfileId === id) {
          throw new AppError(400, "INVALID_PROFILE", "Escolha outro perfil para mover os usuários.", {
            field: "moveToProfileId",
          });
        }

        const found = await this.repository.findById(input.moveToProfileId, context.churchId, tx);
        if (!found) {
          throw new AppError(400, "INVALID_PROFILE", "Perfil de destino não encontrado.", { field: "moveToProfileId" });
        }
        target = mapProfile(found);

        // Quem passa ao destino ganha as protegidas dele; quem sai deste perde as daqui.
        assertCanChangeKeys(target.permissions, context.permissions);
        assertCanChangeKeys(before.permissions, context.permissions, "retirar");
      }

      await this.repository.delete(id, target?.id ?? null, tx);

      await audit({
        organizationId: context.churchId,
        module: "ACESSO",
        action: "excluir_perfil",
        targetType: "AccessProfile",
        targetId: id,
        description: target ? `Usuários e convites movidos para "${target.name}"` : undefined,
        before: { ...auditView(before), userCount: before.userCount, inviteCount: before.inviteCount },
        after: target ? { movedToProfileId: target.id, movedToProfileName: target.name } : undefined,
      });
    });
  }

  // Grupos inteiros e dependências incluídas; chave desconhecida é erro do cliente.
  private prepare(input: AccessProfileBody) {
    const { permissions, unknown } = normalizePermissions(input.permissions);

    if (unknown.length) {
      throw new AppError(400, "UNKNOWN_PERMISSION", `Permissão desconhecida: ${unknown.join(", ")}.`, {
        field: "permissions",
      });
    }

    return { name: input.name, description: input.description ?? null, permissions: permissions as string[] };
  }
}
