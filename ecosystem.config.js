module.exports = {
  apps: [{
    name: "WSAC-Backend",
    script: "./server.js", // Basado en tu directorio, este es el archivo principal
    watch: false,         // Desactivamos el watch local para usar el flujo de Git
    env: {
      NODE_ENV: "production",
      PORT: 3000 // Asegúrate de que coincida con tu .env o server.js
    }
  }],

  deploy: {
    production: {
      user: "Administrator",
      host: "3.133.217.145",
      ref: "origin/main", // O la rama que estés usando
      repo: "git@github.com:eagudelowoden/WSAC_PRD.git",
      path: "C:/Users/Administrator/Documents/WSAC_PROD",
      // Comando para actualizar: /pruebas
      "post-deploy": "npm install && pm2 reload ecosystem.config.js"
    }
  }
};