module.exports = {
  apps: [{
    name: "WSAC-Backend",
    script: "./index.js", // Asegúrate de que este sea tu archivo de entrada (o app.js)
    env: {
      NODE_ENV: "production",
    }
  }],

  deploy: {
    production: {
      user: "tu-usuario-servidor", // Ejemplo: 'ubuntu' o 'root'
      host: "la-ip-de-tu-vps",    // La IP de tu servidor real
      ref: "origin/main",         // O la rama que uses (master/main)
      repo: "git@github.com:eagudelowoden/WSAC_PRD.git", // Tu URL SSH
      path: "/var/www/WSAC",      // Carpeta donde se guardará en el servidor
      "post-deploy": "npm install && pm2 reload ecosystem.config.js"
    }
  }
};