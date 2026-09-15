import { FastifyPluginAsync } from "fastify";
import { BankAccountController } from "./controller.js";
import { BankAccountRepository } from "./repository.js";
import { BankAccountService } from "./service.js";

const repository = new BankAccountRepository();
const service = new BankAccountService(repository);
const controller = new BankAccountController(service);

export const bankAccountRoutes: FastifyPluginAsync = async (app) => {
  app.get("/bancos-contas", controller.list);
  app.get("/bancos-contas/:id", controller.getById);
  app.post("/bancos-contas", controller.create);
  app.put("/bancos-contas/:id", controller.update);
  app.delete("/bancos-contas/:id", controller.remove);
};
