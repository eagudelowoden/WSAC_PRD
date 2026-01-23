const { createApp } = Vue;
createApp({
  data() {
    return {
      tab: "users",
      usuarios: [],
      emails: [],
      nuevoEmail: "",
      nuevoEmailNomina: "", // Para Nómina
      emailsNomina: [], // Lista Nómina
      isDarkMode: false,
      userPermisoId: null,
      userPermisoNombre: "",
      mapaPermisos: {
        tarjeta_contratacion: false,
        editar_salario: false,
        editar_ciudad: false,
      },
    };
  },
  mounted() {
    const savedTheme = localStorage.getItem("theme") || "light";
    this.isDarkMode = savedTheme === "dark";
    document.documentElement.setAttribute("data-bs-theme", savedTheme);
    this.cargarDatos();
  },
  methods: {
    toggleTheme() {
      this.isDarkMode = !this.isDarkMode;
      const theme = this.isDarkMode ? "dark" : "light";
      document.documentElement.setAttribute("data-bs-theme", theme);
      localStorage.setItem("theme", theme); // Guardar preferencia
    },
    async seleccionarUsuarioPermisos(user) {
      this.userPermisoId = user.id;
      this.userPermisoNombre = user.nombre;
      // Cargar permisos desde la API
      const res = await fetch(`/api/admin/permisos/${user.id}`);
      const data = await res.json();
      // Resetear mapa y asignar lo que venga de la BD
      this.mapaPermisos = {
        tarjeta_contratacion: data.tarjeta_contratacion || false,
        editar_salario: data.editar_salario || false,
        editar_ciudad: data.editar_ciudad || false,
      };
    },

    async guardarPermisos() {
      const res = await fetch("/api/admin/permisos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario_id: this.userPermisoId,
          permisos: this.mapaPermisos,
        }),
      });
      if (res.ok) {
        Swal.fire("Éxito", "Permisos actualizados correctamente", "success");
      }
    },
    async cargarDatos() {
      // Cargar Usuarios
      const resUser = await fetch("/api/admin/users");
      this.usuarios = await resUser.json();

      // Cargar Emails
      const resEmail = await fetch("/api/admin/emails");
      this.emails = await resEmail.json();

      const resNom = await fetch("/api/admin/emails-nomina");
      this.emailsNomina = await resNom.json();
    },

    // --- LÓGICA USUARIOS ---
    async abrirModalUsuario() {
      const { value: formValues } = await Swal.fire({
        title:
          '<span class="fw-bold" style="color: #1e293b; font-size: 1.25rem;">Nuevo Usuario</span>',
        html: `
      <div class="text-start px-3" style="font-family: 'Segoe UI', sans-serif;">
        <div class="mb-2">
          <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-left: 5px;">Nombre Completo</label>
          <input id="swal-nombre" class="swal-custom-input" placeholder="Ej. Juan Pérez">
        </div>
        <div class="mb-2">
          <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-left: 5px;">Usuario (Login)</label>
          <input id="swal-user" class="swal-custom-input" placeholder="jperez">
        </div>
        <div class="mb-2">
          <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-left: 5px;">Contraseña</label>
          <input id="swal-pass" type="password" class="swal-custom-input" placeholder="••••••••">
        </div>
        <div class="mb-1">
          <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-left: 5px;">Rol de Sistema</label>
          <select id="swal-rol" class="swal-custom-select">
            <option value="aprobadorUno">AprobadorUno (Carga datos)</option>
            <option value="aprobadorDos">AprobadorDos (Valida contratos)</option>
            <option value="superadmin">Super Admin (Control total)</option>
          </select>
        </div>
      </div>
      <style>
        .swal-custom-input, .swal-custom-select {
          width: 100%;
          padding: 10px 15px;
          margin: 5px 0 10px 0;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          font-size: 0.9rem;
          outline: none;
          transition: all 0.2s;
          display: block;
          box-sizing: border-box;
        }
        .swal-custom-input:focus, .swal-custom-select:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .swal2-actions { margin-top: 20px !important; }
      </style>
    `,
        showCancelButton: true,
        confirmButtonText: "Crear Usuario",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#3b82f6",
        cancelButtonColor: "#f1f5f9",
        customClass: {
          confirmButton: "btn-confirm-swal",
          cancelButton: "btn-cancel-swal",
        },
        // Aplicamos un pequeño truco para que los botones se vean modernos
        didOpen: () => {
          const cancelBtn = Swal.getCancelButton();
          cancelBtn.style.color = "#64748b";
          cancelBtn.style.fontWeight = "600";
        },
        focusConfirm: false,
        preConfirm: () => {
          const nombre = document.getElementById("swal-nombre").value;
          const usuario = document.getElementById("swal-user").value;
          const password = document.getElementById("swal-pass").value;
          const rol = document.getElementById("swal-rol").value;

          if (!nombre || !usuario || !password) {
            Swal.showValidationMessage(`Por favor completa todos los campos`);
            return false;
          }
          return { nombre, usuario, password, rol };
        },
      });

      if (formValues) {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formValues),
        });
        this.cargarDatos();
        Swal.fire({
          icon: "success",
          title: "¡Creado!",
          text: "Usuario agregado correctamente",
          timer: 2000,
          showConfirmButton: false,
        });
      }
    },

    async eliminarUsuario(id) {
      const result = await Swal.fire({
        title: "¿Eliminar usuario?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
      });
      if (result.isConfirmed) {
        await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
        this.cargarDatos();
      }
    },

    // --- LÓGICA EMAILS ---
    async agregarEmail() {
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: this.nuevoEmail }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        this.nuevoEmail = "";
        this.cargarDatos();
        Swal.fire({
          toast: true,
          icon: "success",
          title: "Correo agregado",
          position: "top-end",
          showConfirmButton: false,
          timer: 2000,
        });
      } else {
        Swal.fire("Error", data.message, "error");
      }
    },

    async eliminarEmail(email) {
      await fetch("/api/admin/emails", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      this.cargarDatos();
    },

    async agregarEmailNomina() {
      try {
        const res = await fetch("/api/admin/emails-nomina", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // IMPORTANTE: Usa la variable nuevoEmailNomina
          body: JSON.stringify({ email: this.nuevoEmailNomina }),
        });

        const data = await res.json();

        if (data.status === "ok") {
          this.nuevoEmailNomina = ""; // Limpiar campo
          await this.cargarDatos(); // Refrescar listas

          Swal.fire({
            toast: true,
            icon: "success",
            title: "Suscrito a Nómina",
            position: "top-end",
            showConfirmButton: false,
            timer: 2000,
          });
        } else {
          throw new Error(data.message);
        }
      } catch (error) {
        Swal.fire("Error", "No se pudo agregar el correo de nómina", "error");
      }
    },
  },
}).mount("#app");
