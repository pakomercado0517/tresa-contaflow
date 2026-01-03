import app from "./server.js";

const port = parseInt(process.env.PORT || "3001");

const startServer = async () => {
  try {
    app.listen(port, () =>
      console.warn(`🚀Servidor corriendo en el puerto ${port}`)
    );
  } catch (error) {
    console.error("❌ Error al iniciar el servidor", error);
    throw error;
  }
};

void startServer();
