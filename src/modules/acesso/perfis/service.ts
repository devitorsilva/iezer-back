import type { RequestContext } from "../../../lib/access.js";
import { runAudited } from "../../../lib/audit.js";
import { AppError } from "../../../lib/errors.js";
import { factoryPermissionKeys, getPermission, isPermissionKey } from "../permissoes/catalog/index.js";
import type { AccessProfileRepository, AccessProfileWithPermissions } from "./repository.js";

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
    assignmentCount: profile._count.assignments,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export class AccessProfileService {
  constructor(private readonly repository: AccessProfileRepository) {}

  async list(churchId: string) {
    const profiles = await this.repository.findAll(churchId);
    return profiles.map(mapProfile);
  }

  // Restaurar padrão (RT-AB06) com as travas de protegidas e de último admin (RT-AB07).
  async restore(context: RequestContext, churchId: string, id: string) {
    return runAudited(context.actor, async (tx, audit) => {
      const profile = await this.repository.findById(id, churchId, tx);
      if (!profile) throw new AccessProfileNotFoundError();

      if (!profile.factoryKey) {
        throw new AppError(400, "NOT_FACTORY_PROFILE", "Só perfis de fábrica podem ser restaurados ao padrão.");
      }

      const before = mapProfile(profile);
      const target = factoryPermissionKeys(profile.factoryKey);

      // Só quem já tem uma permissão protegida pode concedê-la.
      const granted = target.filter((key) => !before.permissions.includes(key));
      const missingProtected = granted.find(
        (key) => getPermission(key).protected && !context.permissions.has(key),
      );

      if (missingProtected) {
        const name = getPermission(missingProtected).name;
        throw new AppError(
          403,
          "PROTECTED_PERMISSION",
          `Só quem já tem a permissão "${name}" pode concedê-la.`,
        );
      }

      // Chaves fora do catálogo atual somem na restauração.
      await this.repository.replacePermissions(id, target, tx);

      if ((await this.repository.countActiveAdmins(churchId, tx)) === 0) {
        throw new AppError(
          409,
          "LAST_ADMIN",
          "A igreja ficaria sem ninguém com \"Gerenciar perfis de acesso\". Dê essa permissão a outra pessoa antes.",
        );
      }

      const after = mapProfile((await this.repository.findById(id, churchId, tx))!);

      await audit({
        organizationId: churchId,
        module: "ACESSO",
        action: "restaurar_perfil",
        targetType: "AccessProfile",
        targetId: id,
        before: { name: before.name, permissions: before.permissions.filter(isPermissionKey) },
        after: { name: after.name, permissions: after.permissions },
      });

      return after;
    });
  }
}
