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
      cargandoUsuarios: false, // 1. AGREGAR ESTA VARIABLE
      usuarioLogueadoId: null,
      usuarioSys: null,
      avisoGlobal: { activo: false, mensaje: "", fecha: "" },
      bannerCerradoManualmente: false,
      socket: null,
      filtroNombre: "",
    };
  },
  mounted() {
    // Al cargar la página, pedimos las listas necesarias
    this.cargarPlantillas();
    this.cargarSegmentos();
    this.chequearAvisoMantenimiento();
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

    async cargarPermisosDeEsteUsuario(userId) {
      try {
        const res = await fetch(`/api/admin/permisos/${userId}`);
        const data = await res.json();

        // Asignamos los permisos que vienen de la base de datos
        this.permisos = {
          tarjeta_contratacion: data.tarjeta_contratacion || false,
          editar_salario: data.editar_salario || false,
          editar_ciudad: data.editar_ciudad || false,
        };

        console.log("✅ Permisos aplicados:", this.permisos);
      } catch (e) {
        console.error("❌ Error cargando permisos:", e);
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
          segmento,
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
          `${carpetaUsuario}/contratos_generados`,
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
          credentials: "include",
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
    async eliminarDocumentoFirmado(nombreArchivo) {
      // 1. Validar que el usuario y la carpeta existan antes de empezar
      // Ajusta 'usuarioActual' al nombre real de tu objeto en data() o props
      const usuario =
        this.usuarioActual || this.usuario || this.usuarioSeleccionado;

      if (!usuario || !usuario.carpeta) {
        console.error(
          "No se encontró la información del usuario o su carpeta",
          usuario,
        );
        return Swal.fire(
          "Error",
          "No se pudo identificar la carpeta del usuario",
          "error",
        );
      }

      // 2. Preguntar confirmación
      const result = await Swal.fire({
        title: "¿Borrar este documento?",
        text: "Se eliminará permanentemente de los archivos firmados.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        confirmButtonText: "Sí, borrar",
        cancelButtonText: "Cancelar",
      });

      if (!result.isConfirmed) return;

      // 3. Construir la Key exacta
      const key = `${usuario.carpeta}/documentos_firmados/${nombreArchivo}`;

      Swal.showLoading();

      try {
        // 4. Llamada al API
        const response = await fetch("/api/docs/eliminar-archivo", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: key }),
          credentials: "include",
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

          // 5. Recargar la lista (asegúrate de que este método existe)
          if (this.obtenerDocumentosFirmados) {
            await this.obtenerDocumentosFirmados();
          }
        } else {
          throw new Error(data.message);
        }
      } catch (error) {
        console.error("Error al eliminar:", error);
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
        console.log("Generating document..." + this.usuarioActual.id);
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
      listaFirmados: [], // Los que el colaborador sube
      filtroEstado: "todos",
      filtroPendiente: "pendientes",
      filtroEstadoOptions: [
        { value: "todos", text: "Todos" },
        { value: "hoy", text: "Registrados Hoy" },
        { value: "pendientes", text: "Pendientes" },
        { value: "aprobados", text: "Aprobados" },
      ],
      usuarioSys: null,
      permisos: {
        tarjeta_contratacion: false, // Controla si se ve la card lateral
        editar_salario: false,
        editar_ciudad: false,
      },
      aprobacion: "",
      busqueda: "",
      menuAbierto: false, // Controla si se ve el menú

      form: {
        cargo: "",
        salario: "",
        ciudad: "",
        observaciones: "",
        tipo_contrato: "",
        // Campos nuevos
        segmento_contrato: "",
        descripcion_cargo: "",
      },
      listadoTiposContratos: [
        "CONTRATO INDEFINIDO",
        "CONTRATO OBRA O LABOR",
        "CONTRATO APRENDIZAJE ETAPA LECTIVA",
        "CONTRATO APRENDIZAJE ETAPA PRODUCTIVA",
        "TERMINO FIJO",
      ],
      correoAprendizaje: "",
      curso: "",
      institucion: "",
      nitInstitucion: "",
      centroSena: "",
      fechaterminacion: "",
      archivos: [],
      cargandoArchivos: false,
    };
  },
  computed: {
    archivosFiltrados() {
      if (!this.filtroNombre) return this.archivos;
      const search = this.filtroNombre.toLowerCase();
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
      } else if (this.filtroEstado === "aprobados") {
        // Aquí agregamos la condición para que filtre los que tengan valor "3"
        lista = lista.filter((u) => u.aprobacion === "3");
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
  async mounted() {
    // 1. PRIMERO: Identificar al usuario (Lo más importante)
    try {
      await this.identificarAdmin();
      console.log("👤 Usuario cargado:", this.usuarioSys?.nombre);

      // Solo si el usuario cargó bien, traemos su lista
      if (this.usuarioSys) {
        this.obtenerListaUsuarios();
      }
    } catch (e) {
      console.error("❌ Error al identificar usuario:", e);
    }

    // 2. SEGUNDO: Cargar datos de la interfaz
    this.cargarPlantillas();
    this.cargarSegmentos();
    this.chequearAvisoMantenimiento();
    setInterval(() => {
      this.chequearAvisoMantenimiento();
    }, 30000);

    this.socket = io();
    // 3. TERCERO: Conectar Socket (Con protección total)
    if (typeof io !== "undefined") {
      try {
        // Importante: No llamar a io() fuera del try/catch
        this.socket = io();

        // Dentro de tu mounted, donde inicializas el socket
        this.socket.on("nuevo-aviso-global", (aviso) => {
          console.log("📢 Socket Recibido:", aviso);

          if (!this.bannerCerradoManualmente) {
            this.avisoGlobal = {
              ...aviso,
              activo: aviso.activo == true || aviso.activo == 1,
            };
          }
        });

        this.socket.on("connect_error", (err) => {
          console.warn(
            "⚠️ Error de conexión de socket (Servidor posiblemente caído):",
            err.message,
          );
        });
      } catch (err) {
        console.error("❌ Error crítico al inicializar socket:", err);
      }
    } else {
      console.warn("⚠️ Librería Socket.io no encontrada en el HTML.");
    }
  },
  methods: {
    seleccionarFiltro(estado) {
      // 1. Cambiamos el estado (tu lógica actual)
      this.filtroEstado = estado;

      // 2. Forzamos el cierre del menú haciendo un click rápido al botón
      if (this.$refs.dropdownBoton) {
        this.$refs.dropdownBoton.click();
      }
    },
    cerrarBannerPorAhora() {
      this.bannerCerradoManualmente = true;
      this.avisoGlobal.activo = false; // Lo ocultamos de inmediato
    },
    async chequearAvisoMantenimiento() {
      if (this.bannerCerradoManualmente) return;

      try {
        const response = await fetch(
          "/api/check-mantenimiento?t=" + new Date().getTime(),
        );
        const data = await response.json();

        console.log("🔍 Datos crudos del servidor:", data);

        if (data) {
          // CONVERSIÓN EXPLÍCITA: Si viene 1, 0, "1" o "true", esto lo vuelve booleano real
          const estadoActivo = data.activo == true || data.activo == 1;

          if (!estadoActivo) {
            this.bannerCerradoManualmente = false;
          }

          // Creamos el objeto limpio para Vue
          this.avisoGlobal = {
            ...data,
            activo: estadoActivo,
          };

          console.log("✅ avisoGlobal actualizado:", this.avisoGlobal);
        }
      } catch (error) {
        console.error("❌ Error al obtener mantenimiento:", error);
      }
    },
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

    async seleccionarUsuario(id) {
      // 1. Guardamos el ID seleccionado
      this.selectedId = id;

      // 2. Cargamos primero los datos del usuario de la BD
      // (Esto es vital porque llena 'this.usuarioActual' y su 'carpeta')
      await this.cargarUsuarioDesdeBD();
      await this.obtenerDocumentosFirmados();

      // 3. Una vez cargado el usuarioActual, traemos sus archivos específicos
      if (this.usuarioActual && this.usuarioActual.carpeta) {
        // await this.obtenerHistorialS3(); // Contratos generados por admin
        await this.obtenerDocumentosFirmados(); // Documentos subidos por el colaborador
      }
    },

    async cargarPermisos() {
      const res = await fetch(
        `/api/usuarios/permisos/${this.usuarioActual.id}`,
      );
      this.permisos = await res.json();
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
        userData.tipo_contrato = userData.tipo_contrato;
        userData.aprobacion = userData.aprobacion;
        userData.fechaSuscripcion = userData.fecha_suscripcion;
        userData.curso = userData.curso; // Nuevo campo para contrato de aprendizaje
        userData.curso = userData.curso; // Nuevo campo para contrato de aprendizaje
        if (userData.fechaSuscripcion)
          userData.fechaSuscripcion = userData.fechaSuscripcion.split("T")[0];

        if (userData.fechaNacimiento)
          userData.fechaNacimiento = userData.fechaNacimiento.split("T")[0];

        userData.fechaterminacion = userData.fechaterminacion
          ? userData.fechaterminacion.split("T")[0]
          : ""; // <--- Esto hace que se vea en el HTML

        this.usuarioActual = userData;

        // Llenar formulario
        this.form.cargo = userData.cargo || "";
        this.form.salario = userData.salario || "";
        this.form.ciudad = userData.ciudad || "";
        this.form.observaciones = userData.observaciones || "";
        this.form.otroSi = userData.otroSi || "";
        this.form.segmento_contrato = userData.segmento_contrato || "";
        this.form.fechaSuscripcion = userData.fechaSuscripcion || "";
        this.form.tipo_contrato = userData.tipo_contrato || [];
        this.form.curso = userData.curso || "";
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
              `${API_URL}/archivos/${userData.carpeta}`,
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
                  tokenHash,
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
        this.usuarioActual.curso = this.form.curso;

        // ------------------------------------------------------------------

        const response = await fetch(
          `${API_URL}/usuario/${this.usuarioActual.id}`,
          {
            method: "PUT", // Ruta para actualizar
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(this.usuarioActual),
          },
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
          "error",
        );
      }
    },
    async obtenerDocumentosFirmados() {
      if (!this.usuarioActual?.carpeta) return;

      try {
        // 1. Fetch rápido (el JSON ahora es mucho más ligero)
        const res = await fetch(
          `/api/listar-firmados/${this.usuarioActual.carpeta}`,
        );
        const data = await res.json();

        // 2. Mapeo ultra-rápido en el cliente
        this.listaFirmados = data.map((file) => ({
          ...file,
          // Usamos tu endpoint '/api/ver-archivo' que ya gestiona el streaming o redirección
          url: `/api/ver-archivo?token=${encodeURIComponent(file.key)}`,
        }));
      } catch (error) {
        console.error("❌ Error:", error);
        this.listaFirmados = [];
      }
    },
    async eliminarUsuario(id) {
      // 1. Preguntar ¿Estás seguro?
      const result = await Swal.fire({
        title: "¿Estás seguro?",
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
    async solicitarFirmaContratos() {
      // Validación: Si no hay contratos generados, no tiene sentido pedir firma
      if (!this.usuarioActual || this.listaContratos.length === 0) {
        return Swal.fire({
          icon: "warning",
          title: "SIN DOCUMENTOS",
          text: "Primero debes generar los contratos (Word a PDF) antes de solicitar la firma.",
          confirmButtonColor: "#1e3a8a",
        });
      }

      // 1. Confirmación Visual
      const { isConfirmed } = await Swal.fire({
        title: "¿SOLICITAR FIRMA DIGITAL?",
        html: `
      <div style="text-align:left; padding:10px;">
        <p>Se enviará un acceso a <b>${
          this.usuarioActual.nombres + " " + this.usuarioActual.apellidos
        }</b> para firmar:</p>
        <ul style="font-size: 0.85rem; color: #475569;">
          ${this.listaContratos
            .map((c) => `<li><i class="bi bi-file-pdf"></i> ${c.name}</li>`)
            .join("")}
        </ul>
        <div style="background:#f0f9ff; padding:12px; border-radius:10px; border:1px solid #bae6fd; margin-top:15px;">
          <small class="text-primary">
            <i class="bi bi-info-circle-fill"></i> El sistema habilitará estos documentos para carga de firma en la carpeta <b>documentos_firmados</b>.
          </small>
        </div>
      </div>
    `,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "SÍ, ENVIAR PARA FIRMA",
        cancelButtonText: "CANCELAR",
        confirmButtonColor: "#0891b2",
        reverseButtons: true,
        customClass: { popup: "rounded-5 shadow-lg" },
      });

      if (!isConfirmed) return;

      // 2. Cargando
      Swal.fire({
        title: "PROCESANDO SOLICITUD",
        html: "Generando link y preparando documentos...",
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false,
      });

      try {
        const res = await fetch(`/api/solicitar-firma-contratos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: this.usuarioActual.id,
            correo: this.usuarioActual.correo, // Enviamos el correo por si acaso
            nombres: this.usuarioActual.nombres,
            archivosAFirmar: this.listaContratos, // <--- AQUÍ ENVIAMOS LOS DOCUMENTOS
          }),
        });

        const data = await res.json();

        if (data.status === "ok") {
          Swal.fire({
            icon: "success",
            title: "SOLICITUD ENVIADA",
            text: `Se ha enviado el correo a ${this.usuarioActual.correo} con éxito.`,
            timer: 3500,
            showConfirmButton: false,
            customClass: { popup: "rounded-5" },
          });
        } else {
          throw new Error(data.message);
        }
      } catch (error) {
        console.error("Error al solicitar firma:", error);
        Swal.fire({
          icon: "error",
          title: "FALLO EN EL PROCESO",
          text:
            error.message || "No se pudo conectar con el servicio de firmas.",
          confirmButtonColor: "#d33",
        });
      }
    },

    async enviarContratosAlCorreo() {
      if (!this.usuarioActual || this.listaContratos.length === 0) return;

      // 1. Confirmación con Estética Profesional
      const { isConfirmed } = await Swal.fire({
        width: "500px",
        title: `
            <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin-top:10px;">
                <i class="bi bi-file-earmark-post-fill" style="color:#1e3a8a; font-size:1.5rem;"></i>
                <span style="font-size:1.3rem; font-weight:900; color:#1a2a3a;">NOTIFICAR CONTRATACIÓN</span>
            </div>
        `,
        html: `
            <div style="text-align:left; padding:10px 25px 0 25px; box-sizing:border-box;">
                <div style="background:#f0f4f8; border-radius:12px; padding:15px; border:1px solid #d1d9e6; margin-bottom:20px;">
                    <div style="font-size:1rem; color:#1a2a3a; margin-bottom:5px;">
                        <i class="bi bi-person-circle me-2" style="color:#1e3a8a;"></i> <b>${this.usuarioActual.nombres}</b>
                    </div>
                    <div style="font-size:0.9rem; color:#64748b;">
                        <i class="bi bi-envelope-at-fill me-2"></i> ${this.usuarioActual.correo}
                    </div>
                </div>
                <p style="font-size:0.95rem; color:#475569; text-align:center;">
                    Se enviarán <b>${this.listaContratos.length}</b> documentos adjuntos de forma segura. ¿Desea continuar?
                </p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: "SÍ, ENVIAR AHORA",
        cancelButtonText: "CANCELAR",
        confirmButtonColor: "#1e3a8a",
        cancelButtonColor: "#f8f9fa",
        reverseButtons: true,
        customClass: {
          popup: "rounded-5 border-0 shadow-lg",
          confirmButton: "btn btn-primary rounded-pill py-2 px-5 fw-bold",
          cancelButton: "btn btn-light rounded-pill py-2 px-4 text-muted",
        },
      });

      if (!isConfirmed) return;

      // 2. Cargando Moderno
      Swal.fire({
        title: "PREPARANDO ARCHIVOS",
        html: `
            <div class="py-3 text-center">
                <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;"></div>
                <p class="mt-3 text-muted small">Descargando de S3 y adjuntando al correo...</p>
            </div>
        `,
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      try {
        const res = await fetch(`/api/enviar-historial-contratos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usuario: this.usuarioActual,
            archivos: this.listaContratos,
          }),
        });

        const data = await res.json();

        if (data.status === "ok") {
          Swal.fire({
            icon: "success",
            title: "¡CONTRATOS ENVIADOS!",
            text: "El colaborador ha recibido los documentos exitosamente.",
            timer: 2500,
            showConfirmButton: false,
            customClass: { popup: "rounded-5" },
          });
        } else {
          throw new Error(data.message);
        }
      } catch (error) {
        Swal.fire({
          icon: "error",
          title: "FALLO EN EL ENVÍO",
          text: error.message || "No se pudo conectar con el servidor.",
          confirmButtonColor: "#1e3a8a",
        });
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
        this.usuarioActual.aprobacion = 3;

        // 4. Enviamos la petición al servidor
        const response = await fetch(
          `${API_URL}/usuario/${this.usuarioActual.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(this.usuarioActual),
          },
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
    enviarWhatsApp(doc) {
      if (!this.usuarioActual || !this.usuarioActual.telefono) {
        Swal.fire(
          "Atención",
          "El usuario no tiene teléfono registrado.",
          "warning",
        );
        return;
      }

      // 1. Limpiar el número de cualquier caracter no numérico
      let telefono = this.usuarioActual.telefono.toString().replace(/\D/g, "");

      // 2. Validar y forzar el código 57 (Colombia)
      // Si el número tiene 10 dígitos (celular normal en Colombia), le ponemos el 57
      if (telefono.length === 10) {
        telefono = "57" + telefono;
      }
      // Si ya tiene el 57 al inicio pero solo son 10 dígitos después, lo dejamos así.
      // Si el número empieza por 3 (celular) y no tiene el 57, se lo ponemos.
      else if (telefono.startsWith("3") && telefono.length === 10) {
        telefono = "57" + telefono;
      }

      const mensaje = encodeURIComponent(
        `Hola ${this.usuarioActual.nombres}, te envío el documento firmado: *${doc.name}*.\n\nPuedes verlo aquí: ${doc.url}`,
      );

      // 3. Construir URL
      const url = `https://wa.me/${telefono}?text=${mensaje}`;

      // 4. CONTROL DE VENTANA:
      // En lugar de '_blank' (que siempre abre una nueva), usamos un nombre fijo como 'WhatsAppWindow'.
      // Esto hará que si ya hay una pestaña de WhatsApp abierta por tu app, se REUSE esa misma.
      window.open(url, "WhatsAppWindow");
    },
    async cerrarSesion() {
      this.menuAbierto = false;

      try {
        // 1. PETICIÓN AL BACKEND: Destruir la sesión en el servidor
        // Esto borra el registro de la tabla de MySQL y limpia la cookie
        const response = await fetch("/api/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          console.warn(
            "El servidor no pudo cerrar la sesión, pero procederemos localmente.",
          );
        }
      } catch (error) {
        console.error("Error de red al intentar cerrar sesión:", error);
      }

      // 2. LIMPIEZA LOCAL: Borrar token y datos del navegador
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      sessionStorage.clear();

      // 3. MENSAJE Y REDIRECCIÓN
      Swal.fire({
        icon: "success",
        title: "Sesión cerrada",
        showConfirmButton: false,
        timer: 1000,
      }).then(() => {
        // IMPORTANTE: Al redirigir, el navegador ya no enviará la cookie vieja
        window.location.href = "/login.html";
      });
    },
  },
}).mount("#app");
