import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startAnnouncementEmailDispatcher } from "./modules/admin/avisos/envio.js";

const app = buildApp();

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`API running on port ${env.PORT}`);
    startAnnouncementEmailDispatcher();
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });

