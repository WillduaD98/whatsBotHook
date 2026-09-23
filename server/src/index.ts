import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { startScheduler } from "./services/scheduler.service.js";
import { startWebhookWorker } from "./services/webhookWorker.service.js";
import { uploadsPath } from "./config/paths.js";

async function main() {
  await connectDB();
  
  // Iniciar el planificador de tareas (follow-ups)
  startScheduler();

  // Iniciar el worker de la cola de webhooks (barrido de eventos pendientes).
  // Con await: primero recupera los eventos que quedaron a medias por un reinicio y solo después
  // el servidor empieza a recibir webhooks (app.listen), para no procesar nada dos veces.
  await startWebhookWorker();

  const app = createApp();
  console.log("Creando aplicación express...");
  app.listen(env.PORT, () => {
    console.log(`✅ WhatsAppService running on port ${env.PORT}`);
    console.log(`📂 Static files served from: ${uploadsPath}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
