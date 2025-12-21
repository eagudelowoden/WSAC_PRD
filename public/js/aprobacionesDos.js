const { createApp } = Vue;
// const PORT = process.env.PORT;
const API_URL = "/api";
const Router_URL = "/routes";

// =======================================================
// 1. DEFINIMOS LA LÓGICA DE SEGMENTOS AQUÍ MISMO
// =======================================================
const SegmentosMixin = {
  data() {
    return {
      listaSegmentos: [], // Carpetas de segmentos
      listaCargosPDF: [], // Archivos PDF dentro del segmento
      listaPlantillas: [], // Archivos Word para generar contratos
      plantillaSeleccionada: "",
      listaContratos: [],
      busqueda: "",
      usuarioActual: null,
      docGenerado: null, // <--- AGREGA ESTO AQUÍ
      cargandoCargos: false,
      cargandoUsuario: false,
      usuarioSys: null,
      cargandoUsuarios: false, // 1. AGREGAR ESTA VARIABLE
    };
  },
  mounted() {
    // Al cargar la página, pedimos las listas necesarias
    this.cargarPlantillas();
    this.cargarSegmentos();
  },
  methods: {
    // --- A. SEGMENTOS Y PDFs ---
    async cargarSegmentos() {
      console.log("🔄 Cargando segmentos...");
      try {
        const res = await fetch(`${API_URL}/segmentos`);
        if (!res.ok) throw new Error("Error server");
        this.listaSegmentos = await res.json();
      } catch (e) {
        console.error("Error segmentos:", e);
      }
    },

    async cargarCargosPorSegmento() {
      const segmento = this.form.segmento_contrato;
      this.listaCargosPDF = []; // Limpiar lista anterior

      if (!segmento) {
        this.form.descripcion_cargo = "";
        return;
      }

      this.cargandoCargos = true;
      try {
        const url = `${API_URL}/cargos-por-segmento/${encodeURIComponent(
          segmento
        )}`;
        const res = await fetch(url);
        this.listaCargosPDF = await res.json();
      } catch (e) {
        console.error("Error PDFs:", e);
      } finally {
        this.cargandoCargos = false;
      }
    },

    // Busca si ya existen contratos generados en S3 para este usuario
    async buscarContratoExistente(carpetaUsuario) {
      this.listaContratos = []; // Limpiar lista

      if (!carpetaUsuario) return;

      try {
        const subcarpeta = encodeURIComponent(
          `${carpetaUsuario}/contratos_generados`
        );

        // Llamamos a tu endpoint que lista archivos
        const response = await fetch(`/api/archivos/${subcarpeta}`);
        const archivos = await response.json();

        if (archivos && archivos.length > 0) {
          // Guardamos TODOS los archivos
          this.listaContratos = archivos;
        }
      } catch (error) {
        console.error("Error buscando contratos:", error);
      }
    },
    async eliminarContrato(nombreArchivo) {
      // 1. Preguntar confirmación
      const result = await Swal.fire({
        title: "¿Borrar este documento?",
        text: "Esta acción no se puede deshacer.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        confirmButtonText: "Sí, borrar",
        cancelButtonText: "Cancelar",
      });

      if (!result.isConfirmed) return;

      // 2. Construir la ruta (Key)
      const carpetaUsuario = this.usuarioActual.carpeta;
      const key = `${carpetaUsuario}/contratos_generados/${nombreArchivo}`;

      Swal.showLoading();

      try {
        // 3. AQUÍ ESTÁ LA CLAVE: Usamos fetch, no llamamos a eliminarArchivo()
        const response = await fetch("/api/docs/eliminar-archivo", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: key }),
        });

        const data = await response.json();

        if (data.status === "ok") {
          Swal.fire({
            icon: "success",
            title: "Eliminado",
            toast: true,
            position: "top-end",
            showConfirmButton: false,
            timer: 1500,
          });

          // 4. Recargar la lista
          await this.buscarContratoExistente(carpetaUsuario);
        } else {
          throw new Error(data.message);
        }
      } catch (error) {
        console.error(error);
        Swal.fire("Error", "No se pudo borrar el archivo", "error");
      }
    },
    // --- B. GENERADOR DE WORD ---
    async cargarPlantillas() {
      try {
        const res = await fetch("/api/docs/templates");
        const data = await res.json();
        this.listaPlantillas = data;
      } catch (error) {
        console.error("Error cargando plantillas:", error);
      }
    },

    // Dentro de methods en admin.js

    async generarDocumentoWord() {
      if (!this.usuarioActual || !this.plantillaSeleccionada) return;

      this.docGenerado = null; // Limpiamos previo

      Swal.fire({
        title: "Generando y Subiendo...",
        text: "Guardando en la nube, por favor espere...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      try {
        const response = await fetch("/api/docs/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idColaborador: this.usuarioActual.id,
            nombrePlantilla: this.plantillaSeleccionada,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          Swal.fire({
            icon: "success",
            title: "¡Guardado!",
            text: "El documento se ha generado y guardado.",
            timer: 1500,
            showConfirmButton: false,
          });

          // 👇👇👇 AGREGA ESTAS LÍNEAS AQUÍ 👇👇👇
          // Sin esto, el cuadro verde NUNCA aparecerá
          this.docGenerado = {
            name: data.name,
            url: data.url,
            fecha: new Date().toLocaleTimeString(),
          };
          // 👆👆👆 FIN DE LO NUEVO 👆👆👆

          await this.cargarUsuarioDesdeBD();
        } else {
          Swal.fire("Error", data.message || "No se pudo generar", "error");
        }
      } catch (error) {
        console.error(error);
        Swal.fire("Error", "Fallo de conexión", "error");
      }
    },
  },
};

// =======================================================
// 2. APLICACIÓN PRINCIPAL (Admin Panel)
// =======================================================
createApp({
  // INYECTAMOS LA LÓGICA DE ARRIBA
  mixins: [SegmentosMixin],

  data() {
    return {
      busqueda: "",
      sidebarContraida: false, // Controla el ancho del sidebar
      usuarios: [],
      listaAbierta: false, // Controla si se ven los usuarios
      selectedId: "",
      usuarioActual: null,
      filtroEstado: "todos",
      filtroPendiente: "pendientes",
      filtroEstadoOptions: [
        { value: "todos", text: "Todos" },
        { value: "hoy", text: "Registrados Hoy" },
        { value: "pendientes", text: "Pendientes" },
        { value: "aprobados", text: "Aprobados" },
      ],
      aprobacion: "",
      busqueda: "",
      menuAbierto: false, // Controla si se ve el menú

      form: {
        cargo: "",
        salario: "",
        ciudad: "",
        observaciones: "",
        // Campos nuevos
        segmento_contrato: "",
        descripcion_cargo: "",
      },

      archivos: [],
      cargandoArchivos: false,
    };
  },
  computed: {
    archivosFiltrados() {
      if (!this.busqueda) return this.archivos;
      const search = this.busqueda.toLowerCase();
      return this.archivos.filter((f) => f.name.toLowerCase().includes(search));
    },
    usuariosFiltrados() {
      let lista = this.usuarios;

      // -----------------------------------------------------
      // 1. FILTRO POR ESTADO (Todos vs Hoy)
      // -----------------------------------------------------
      if (this.filtroEstado === "hoy") {
        const fechaHoy = new Date();

        const hoyString =
          fechaHoy.getFullYear() +
          "-" +
          String(fechaHoy.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(fechaHoy.getDate()).padStart(2, "0");

        lista = lista.filter((u) => {
          if (!u.fechaRegistro) return false;
          return u.fechaRegistro.split("T")[0] === hoyString;
        });
      } else if (this.filtroEstado === "todos") {
        lista = lista.filter((u) => {
          const estado = u.aprobacion;

          console.log(`User: ${u.nombres} - Aprobacion: ${estado}`);

          return (
            estado == null || estado === "" || estado == "0" || estado == "1"
          );
        });
      } else if (this.filtroEstado === "pendientes") {
        lista = lista.filter((u) => u.aprobacion === "1");
      }

      // -----------------------------------------------------
      // 2. FILTRO POR BÚSQUEDA
      // -----------------------------------------------------
      if (this.busqueda) {
        const texto = this.busqueda.toLowerCase().trim();
        lista = lista.filter((u) => {
          const nombre = (u.nombres || "").toLowerCase();
          const apellido = (u.apellidos || "").toLowerCase();
          const cedula = (u.documento || "").toString();
          return (
            nombre.includes(texto) ||
            apellido.includes(texto) ||
            cedula.includes(texto)
          );
        });
      }

      return lista;
    },
  },
  mounted() {
    this.obtenerListaUsuarios();
    this.identificarAdmin();
  },
  methods: {
    async obtenerListaUsuarios() {
      // 1. Activamos el spinner antes de empezar
      this.cargandoUsuarios = true;

      try {
        const response = await fetch(`${API_URL}/usuarios`);
        if (!response.ok) throw new Error("Error de conexión");

        this.usuarios = await response.json();
      } catch (error) {
        console.error(error);
        Swal.fire("Error", "No se pudo cargar la lista de usuarios.", "error");
      } finally {
        // 2. IMPORTANTE: Desactivamos el spinner al terminar (sea éxito o error)
        this.cargandoUsuarios = false;
      }
    },

    seleccionarUsuario(id) {
      this.selectedId = id;
      this.cargarUsuarioDesdeBD();
    },

    async cargarUsuarioDesdeBD() {
      // Validación inicial
      if (!this.selectedId) {
        this.usuarioActual = null;
        this.archivos = [];
        return;
      }

      // Activar spinners
      this.cargandoArchivos = true;
      this.cargandoUsuario = true;

      try {
        // ============================================================
        // 1. CARGAR USUARIO
        // ============================================================
        const resUser = await fetch(`${API_URL}/usuario/${this.selectedId}`);
        if (!resUser.ok) throw new Error("Error cargando usuario");

        let userData = await resUser.json();

        // Ajustes visuales de datos
        userData.epsNombre = userData.eps;
        userData.arlNombre = userData.arl;
        userData.afpNombre = userData.afp;
        userData.ccfNombre = userData.ccf;
        userData.otroSi = userData.otro_si;
        userData.aprobacion = userData.aprobacion;
        userData.fechaSuscripcion = userData.fecha_suscripcion;
        if (userData.fechaSuscripcion)
          userData.fechaSuscripcion = userData.fechaSuscripcion.split("T")[0];

        if (userData.fechaNacimiento)
          userData.fechaNacimiento = userData.fechaNacimiento.split("T")[0];

        this.usuarioActual = userData;

        // Llenar formulario
        this.form.cargo = userData.cargo || "";
        this.form.salario = userData.salario || "";
        this.form.ciudad = userData.ciudad || "";
        this.form.observaciones = userData.observaciones || "";
        this.form.otroSi = userData.otroSi || "";
        this.form.segmento_contrato = userData.segmento_contrato || "";
        this.form.fechaSuscripcion = userData.fechaSuscripcion || "";
        const pdfGuardado = userData.descripcion_cargo || "";

        console.log("Usuario cargado:", this.usuarioActual.aprobacion);

        // ============================================================
        // 2. PARALELISMO (Cargar Cargos y Archivos a la vez)
        // ============================================================
        const peticionesEnParalelo = [];

        // A. Cargar Cargos (si aplica)
        if (this.form.segmento_contrato) {
          const promesaCargos = this.cargarCargosPorSegmento().then(() => {
            this.form.descripcion_cargo = pdfGuardado;
          });
          peticionesEnParalelo.push(promesaCargos);
        } else {
          this.form.descripcion_cargo = "";
        }

        // B. Cargar Archivos (CORREGIDO PARA TOKEN)
        if (userData.carpeta) {
          const promesaArchivos = async () => {
            // Pedimos lista al backend (Rápido, sin firmar)
            const resFiles = await fetch(
              `${API_URL}/archivos/${userData.carpeta}`
            );
            const files = await resFiles.json();

            // Mapeamos creando el TOKEN oculto
            this.archivos = files.map((f) => {
              const rutaReal = f.key || userData.carpeta + "/" + f.name;

              // 1. Encriptar a Base64 (Soporte para tildes/ñ con unescape+encode)
              const tokenHash = btoa(unescape(encodeURIComponent(rutaReal)));

              return {
                name: f.name,
                // 2. IMPORTANTE: encodeURIComponent protege el token en la URL
                url: `${API_URL}/ver-archivo?token=${encodeURIComponent(
                  tokenHash
                )}`,
              };
            });

            // Cargar historial de contratos
            await this.buscarContratoExistente(userData.carpeta);
          };

          peticionesEnParalelo.push(promesaArchivos());
        } else {
          this.archivos = [];
        }

        // Esperar a que todo termine
        await Promise.all(peticionesEnParalelo);
      } catch (error) {
        console.error(error);
        Swal.fire("Error", "No se pudieron cargar los detalles", "error");
      } finally {
        this.cargandoArchivos = false;
        this.cargandoUsuario = false;
      }
    },

    async guardarCambiosPersonales() {
      if (!this.usuarioActual) return;

      try {
        Swal.showLoading();

        // ------------------------------------------------------------------
        // PASO CRÍTICO: Sincronizar los datos del formulario con el usuario
        // ------------------------------------------------------------------
        // Como en el HTML usas v-model="form.ciudad", el valor nuevo está en 'form'.
        // Debemos pasarlo a 'usuarioActual' antes de enviarlo al backend.

        this.usuarioActual.ciudad = this.form.ciudad;
        this.usuarioActual.cargo = this.form.cargo; // Opcional: si quieres actualizar cargo aquí también
        this.usuarioActual.salario = this.form.salario; // Opcional: si quieres actualizar salario aquí también
        this.usuarioActual.observaciones = this.form.observaciones;
        this.usuarioActual.otroSi = this.form.otroSi;

        // ------------------------------------------------------------------

        const response = await fetch(
          `${API_URL}/usuario/${this.usuarioActual.id}`,
          {
            method: "PUT", // Ruta para actualizar
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(this.usuarioActual),
          }
        );

        const data = await response.json();

        if (data.status === "ok") {
          Swal.fire({
            icon: "success",
            title: "Guardado",
            text: "Los datos han sido actualizados.",
            timer: 1500,
            showConfirmButton: false,
          });

          // Refrescamos la lista de la izquierda por si cambiaste nombres/apellidos
          this.obtenerListaUsuarios();
        } else {
          throw new Error(data.message);
        }
      } catch (error) {
        console.error(error);
        Swal.fire(
          "Error",
          "No se pudieron guardar los cambios: " + error.message,
          "error"
        );
      }
    },

    async eliminarUsuario(id) {
      // 1. Preguntar ¿Estás seguro?
      const result = await Swal.fire({
        title: "¿Estás seguroooo?",
        text: "No podrás revertir esta acción.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar",
      });

      if (!result.isConfirmed) return;

      // 2. Enviar petición de borrado al Backend
      try {
        Swal.showLoading();

        const response = await fetch(`${API_URL}/usuario/${id}`, {
          method: "DELETE",
        });

        const data = await response.json();

        if (data.status === "ok") {
          Swal.fire("¡Eliminado!", "El usuario ha sido eliminado.", "success");

          // 3. Actualizar la interfaz
          this.obtenerListaUsuarios(); // Recargar la lista

          // Si el usuario eliminado era el que tenías abierto en pantalla, límpialo
          if (this.usuarioActual && this.usuarioActual.id === id) {
            this.usuarioActual = null;
            this.selectedId = "";
            this.form = {
              cargo: "",
              salario: "",
              ciudad: "",
              observaciones: "",
            }; // Limpiar form
          }
        } else {
          throw new Error(data.message);
        }
      } catch (error) {
        console.error(error);
        Swal.fire("Error", "No se pudo eliminar el usuario.", "error");
      }
    },

    async solicitarCorreccion() {
      if (!this.usuarioActual) return;

      if (!this.usuarioActual.correo) {
        return Swal.fire({
          icon: "info",
          title:
            '<span style="font-size:1.2rem; font-weight:800;">AVISO</span>',
          text: "Usuario sin correo registrado.",
          confirmButtonColor: "#2c3e50",
        });
      }

      const { value: motivo } = await Swal.fire({
        width: "500px",
        title: `
            <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin-top:10px;">
                <i class="bi bi-shield-check" style="color:#e2712a; font-size:1.5rem;"></i>
                <span style="font-size:1.3rem; font-weight:900; color:#1a2a3a;">SOLICITAR SUBSANACIÓN</span>
            </div>
        `,
        html: `
            <div style="text-align:left; padding:10px 25px 0 25px; box-sizing:border-box;">
                <div style="background:#f8fafc; border-radius:12px; padding:15px; border:1px solid #edf2f7; margin-bottom:20px;">
                    <div style="font-size:1rem; color:#1a2a3a; margin-bottom:5px;">
                        <i class="bi bi-person-circle me-2" style="color:#e2712a;"></i> <b>${this.usuarioActual.nombres}</b>
                    </div>
                    <div style="font-size:0.9rem; color:#64748b;">
                        <i class="bi bi-envelope-at-fill me-2"></i> ${this.usuarioActual.correo}
                    </div>
                </div>
                <label style="font-size:0.85rem; font-weight:700; color:#475569; display:block; margin-bottom:8px;">OBSERVACIONES / MOTIVO:</label>
            </div>
        `,
        input: "textarea",
        inputPlaceholder: "Detalle aquí la inconsistencia encontrada...",
        showCancelButton: true,
        confirmButtonText: "ENVIAR",
        cancelButtonText: "CANCELAR",
        confirmButtonColor: "#2a71ff",
        cancelButtonColor: "#f8f9fa",
        reverseButtons: true,
        customClass: {
          popup: "rounded-5 border-0 shadow-lg",
          input: "mx-auto my-2",
          confirmButton: "btn btn-primary rounded-pill py-2 px-5 fw-bold",
          cancelButton: "btn btn-light rounded-pill py-2 px-4 text-muted",
        },
        didOpen: () => {
          const input = Swal.getInput();
          input.style.width = "calc(100% - 50px)";
          input.style.margin = "0 auto";
          input.style.borderRadius = "15px";
          input.style.border = "2px solid #cbd5e1";
          input.style.padding = "15px";
          input.style.height = "120px";
        },
        inputValidator: (value) => {
          if (!value) return "Por favor, detalle el motivo antes de enviar.";
        },
      });

      // Si el usuario escribió un motivo y dio clic en ENVIAR
      if (motivo) {
        // 1. Mostrar el cargando
        Swal.fire({
          title: "ENVIANDO NOTIFICACIÓN",
          html: '<p class="text-muted small">Por favor espere...</p>',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        try {
          // 2. Ejecutar la petición REAL al servidor
          const res = await fetch(`${API_URL}/solicitar-subsanar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: this.usuarioActual.id,
              correo: this.usuarioActual.correo,
              motivo: motivo,
            }),
          });

          const data = await res.json();

          // 3. Cerrar el cargando y mostrar resultado
          if (data.status === "ok") {
            Swal.fire({
              icon: "success",
              title: "¡ENVIADO!",
              text: "El correo ha sido entregado correctamente.",
              timer: 2000,
              showConfirmButton: false,
              customClass: { popup: "rounded-5" },
            });
          } else {
            Swal.fire({
              icon: "error",
              title: "ERROR EN EL ENVÍO",
              text: data.message || "No se pudo enviar el correo.",
              confirmButtonColor: "#2a71ff",
            });
          }
        } catch (e) {
          // Manejo de errores de conexión
          Swal.fire({
            icon: "error",
            title: "FALLO DE CONEXIÓN",
            text: "No hay respuesta del servidor.",
            confirmButtonColor: "#2a71ff",
          });
        }
      }
    },

    async aprobar() {
      // 1. Confirmación de seguridad
      const result = await Swal.fire({
        title: "Aprobar Contrato",
        html: `
            <p>Se aprobará a <b>${this.usuarioActual.nombres}</b></p>
            <ul style="text-align:left">
                <li>Cargo: <b>${this.form.cargo}</b></li>
                <li>Salario: <b>${this.form.salario}</b></li>
                <li>Segmento: <b>${this.form.segmento_contrato}</b></li>
            </ul>
        `,
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#28a745",
        confirmButtonText: "Sí, Aprobar y Guardar",
        cancelButtonText: "Cancelar",
      });

      // Si el usuario cancela, no hacemos nada
      if (!result.isConfirmed) return;

      try {
        Swal.showLoading();

        // 2. PASO CRÍTICO: Pasar datos del FORMULARIO al USUARIO
        this.usuarioActual.cargo = this.form.cargo;
        this.usuarioActual.salario = this.form.salario;
        this.usuarioActual.ciudad = this.form.ciudad;
        this.usuarioActual.observaciones = this.form.observaciones;

        // IMPORTANTE: Guardamos el segmento y el PDF seleccionado
        this.usuarioActual.segmento_contrato = this.form.segmento_contrato;
        this.usuarioActual.descripcion_cargo = this.form.descripcion_cargo;

        // 3. MARCADO DE APROBACIÓN (Esto pone el 1 en la base de datos)
        this.usuarioActual.aprobacion = 2;

        // 4. Enviamos la petición al servidor
        const response = await fetch(
          `${API_URL}/usuario/${this.usuarioActual.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(this.usuarioActual),
          }
        );

        const data = await response.json();

        if (data.status === "ok") {
          Swal.fire({
            icon: "success",
            title: "¡Aprobado!",
            text: "El contrato ha sido guardado y aprobado exitosamente.",
            timer: 2000,
          });

          // Recargamos la lista para ver los cambios reflejados
          this.obtenerListaUsuarios();
        } else {
          throw new Error(data.message);
        }
      } catch (error) {
        console.error(error);
        Swal.fire("Error", "No se pudo aprobar: " + error.message, "error");
      }
    },

    rechazar() {
      Swal.fire("Rechazado", "Candidato rechazado", "info");
    },
    async identificarAdmin() {
      try {
        // Pide al backend quién soy
        const res = await fetch(`${API_URL}/session/actual`);
        const data = await res.json();

        if (data.status === "ok") {
          // Nota: El backend devuelve 'nombre' (singular) según tu código de server.js
          this.usuarioSys = data.usuario;
        }
      } catch (e) {
        console.error("No se pudo identificar al admin:", e);
      }
    },
    cerrarSesion() {
      this.menuAbierto = false; // Cerramos el menú al hacer click
      // 1. Borrar token y datos del usuario del navegador
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      sessionStorage.clear(); // Limpia la sesión actual por seguridad

      // 2. Mensaje opcional (puedes quitarlo si quieres salir de inmediato)
      Swal.fire({
        icon: "success",
        title: "Sesión cerrada",
        showConfirmButton: false,
        timer: 1000,
      }).then(() => {
        // 3. Redirigir al Login (Ajusta la ruta si tu login es '/login' o '/index.html')
        window.location.href = "/login.html";
      });
    },
  },
}).mount("#app");
