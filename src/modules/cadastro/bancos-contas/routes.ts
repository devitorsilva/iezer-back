import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { BankAccountController } from "./controller.js";
import { BankAccountRepository } from "./repository.js";
import { BankAccountService } from "./service.js";

const repository = new BankAccountRepository();
const service = new BankAccountService(repository);
const controller = new BankAccountController(service);

export const bankAccountRoutes: FastifyPluginAsync = async (app) => {
  // Lookups dos lançamentos: quem vê pagar ou receber também lê os cadastros.
  const ver = {
    preHandler: requirePermission("financeiro.pagar.ver", "financeiro.receber.ver", "financeiro.cadastros.editar"),
  };
  const editar = { preHandler: requirePermission("financeiro.cadastros.editar") };

  app.get("/bancos-contas", ver, controller.list);
  app.get("/bancos-contas/:id", ver, controller.getById);
  app.post("/bancos-contas", editar, controller.create);
  app.put("/bancos-contas/:id", editar, controller.update);
  app.delete("/bancos-contas/:id", editar, controller.remove);
};
