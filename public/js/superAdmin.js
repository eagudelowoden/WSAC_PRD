const { createApp } = Vue;
createApp({
  data() {
    return {
      tab: "users",
      usuarios: [],
      emails: [],
      nuevoEmail: "",
      isDarkMode: false,
    };
  },
  mounted() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    this.isDarkMode = savedTheme === 'dark';
    document.documentElement.setAttribute('data-bs-theme', savedTheme);
    this.cargarDatos();
  },
  methods: {
    toggleTheme() {
      this.isDarkMode = !this.isDarkMode;
      const theme = this.isDarkMode ? "dark" : "light";
      document.documentElement.setAttribute("data-bs-theme", theme);
      localStorage.setItem("theme", theme); // Guardar preferencia
    },
    async cargarDatos() {
      // Cargar Usuarios
      const resUser = await fetch("/api/admin/users");
      this.usuarios = await resUser.json();

      // Cargar Emails
      const resEmail = await fetch("/api/admin/emails");
      this.emails = await resEmail.json();
    },

    // --- LÓGICA USUARIOS ---
    async abrirModalUsuario() {
      const { value: formValues } = await Swal.fire({
        title: "Nuevo Usuario",
        html:
          '<input id="swal-nombre" class="swal2-input" placeholder="Nombre Completo">' +
          '<input id="swal-user" class="swal2-input" placeholder="Usuario (Login)">' +
          '<input id="swal-pass" type="password" class="swal2-input" placeholder="Contraseña">' +
          '<select id="swal-rol" class="swal2-select" style="display:flex; margin: 1em auto; width: 80%; padding: .5em;">' +
          '<option value="editor">Editor</option>' +
          '<option value="aprobador">Aprobador</option>' + // <--- AQUÍ ESTÁ EL NUEVO ROL
          '<option value="superadmin">Super Admin</option>' +
          "</select>",
        focusConfirm: false,
        showCancelButton: true,
        preConfirm: () => {
          return {
            nombre: document.getElementById("swal-nombre").value,
            usuario: document.getElementById("swal-user").value,
            password: document.getElementById("swal-pass").value,
            rol: document.getElementById("swal-rol").value,
          };
        },
      });

      if (formValues) {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formValues),
        });
        this.cargarDatos();
        Swal.fire("Creado", "Usuario agregado correctamente", "success");
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
  },
}).mount("#app");
