import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { startScheduler } from "./services/scheduler.service.js";
import path from "path";

async function main() {
  await connectDB();
  
  // Iniciar el planificador de tareas (follow-ups)
  startScheduler();

  const app = createApp();
  console.log("Creando aplicación express...");
  app.listen(env.PORT, () => {
    console.log(`✅ WhatsAppService running on port ${env.PORT}`);
    console.log(`📂 Static files served from: ${path.join(process.cwd(), "public/uploads")}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
