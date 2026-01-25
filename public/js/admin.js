const { createApp } = Vue;
// const PORT = process.env.PORT;
const API_URL = "/api";
const Router_URL = "/routes";
const Pdf = "/servicePdf";

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
      menuAbierto: false, // Controla si se ve el menú
      sidebarContraida: false,
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
    async vincularPdfAlExpediente() {
      // Validaciones iniciales
      if (!this.usuarioActual || !this.form.descripcion_cargo) {
        Swal.fire(
          "Atención",
          "Seleccione primero la descripción del cargo arriba.",
          "warning",
        );
        return;
      }

      Swal.fire({
        title: "Vinculando documento...",
        text: `Copiando ${this.form.descripcion_cargo} al expediente de S3`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      try {
        const response = await fetch("/api/vincular-cargo-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idColaborador: this.usuarioActual.id,
            archivoPdf: this.form.descripcion_cargo,
            segmento: this.form.segmento_contrato, // Importante para saber en qué subcarpeta de S3 buscar
          }),
        });

        const data = await response.json();

        if (response.ok) {
          Swal.fire({
            icon: "success",
            title: "¡Vinculado!",
            text: "La descripción de cargo ahora es parte del expediente del colaborador.",
            timer: 2000,
            showConfirmButton: false,
          });

          // Refrescamos la lista de archivos (columna derecha) para que aparezca el nuevo PDF
          await this.cargarUsuarioDesdeBD();
        } else {
          Swal.fire(
            "Error",
            data.message || "No se pudo copiar el archivo",
            "error",
          );
        }
      } catch (error) {
        console.error("Error en vinculación:", error);
        Swal.fire(
          "Error",
          "No hay conexión con el servicio de documentos.",
          "error",
        );
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
      if (!this.usuarioActual || !this.form.descripcion_cargo) {
        Swal.fire(
          "Atención",
          "Selecciona primero la Descripción del Cargo en el paso anterior.",
          "warning",
        );
        return;
      }

      this.docGenerado = null;

      Swal.fire({
        title: "Procesando...",
        text: "Generando contrato basado en " + this.form.descripcion_cargo,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      try {
        // --- AQUÍ ESTÁ EL TRUCO ---
        // Si el archivo es "GERENTE.pdf", esto lo convierte en solo "GERENTE"
        // para que el backend busque "GERENTE.docx"
        const nombreLimpio = this.form.descripcion_cargo.replace(".pdf", "");

        const response = await fetch("/api/docs/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idColaborador: this.usuarioActual.id,
            nombrePlantilla: nombreLimpio, // Enviamos el nombre sin el .pdf
            archivoCargoPDF: this.form.descripcion_cargo, // Enviamos el PDF completo para la copia
            segmento: this.form.segmento_contrato,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          Swal.fire({
            icon: "success",
            title: "¡Expediente Creado!",
            text: "Se ha vinculado la descripción y generado el contrato.",
            timer: 2000,
            showConfirmButton: false,
          });

          await this.cargarUsuarioDesdeBD();
        } else {
          // Aquí es donde te salía "Plantilla no encontrada"
          Swal.fire("Error", data.message || "No se pudo procesar", "error");
        }
      } catch (error) {
        console.error(error);
        Swal.fire("Error", "Error de red al conectar con S3", "error");
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
      filtroNombre: "", // Variable para el buscador
      archivos: [], // Tu lista original de archivos
      usuarios: [],
      selectedId: "",
      usuarioActual: null,
      filtroEstado: "todos",
      busqueda: "",
      sidebarContraida: false,
      listaAbierta: false, // Controla si se ven los usuarios

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
      correoAprendizaje  : "",
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
      if (!this.filtroNombre) {
        return this.archivos;
      }
      const busqueda = this.filtroNombre.toLowerCase();
      return this.archivos.filter((archivo) =>
        archivo.name.toLowerCase().includes(busqueda),
      );
    },

    usuariosFiltrados() {
      let lista = this.usuarios;

      // -----------------------------------------------------
      // 1. FILTRO POR ESTADO / FECHA
      // -----------------------------------------------------
      if (this.filtroEstado === "hoy") {
        // CORRECCIÓN: Usamos fecha LOCAL, no UTC (toISOString falla por la tarde)
        const fechaHoy = new Date();
        // Formato YYYY-MM-DD local manual para asegurar compatibilidad
        const hoyString =
          fechaHoy.getFullYear() +
          "-" +
          String(fechaHoy.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(fechaHoy.getDate()).padStart(2, "0");

        lista = lista.filter((u) => {
          if (!u.fechaRegistro) return false;
          // Tomamos solo la parte YYYY-MM-DD de la fecha del usuario
          const fechaUser = u.fechaRegistro.split("T")[0];
          return fechaUser === hoyString;
        });
      } else if (this.filtroEstado === "pendientes") {
        // Mostrar solo: vacíos, null, 0 o 1. (Oculta aprobados si son 2)
        lista = lista.filter((u) => {
          const estado = u.aprobacion;
          // La comparación la hacemos flexible (==) por si viene como texto "0" o número 0
          return estado == null || estado == "" || estado == 0 || estado == 1;
        });
      }

      // -----------------------------------------------------
      // 2. FILTRO POR BÚSQUEDA (Texto)
      // -----------------------------------------------------
      if (this.busqueda) {
        const texto = this.busqueda.toLowerCase().trim(); // Trim quita espacios accidentales

        lista = lista.filter((u) => {
          // BLINDAJE: Usamos (u.campo || '') para que no falle si el campo es null
          const nombre = (u.nombres || "").toLowerCase();
          const apellido = (u.apellidos || "").toLowerCase();
          const cedula = (u.documento || "").toString(); // Convertimos a string por si acaso

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
        userData.correoAprendizaje   = userData.correoAprendizaje  ;
        userData.curso = userData.curso;
        userData.institucion = userData.institucion;
        userData.nitInstitucion = userData.nitinstitucion;
        userData.centroSena = userData.centroSena;
        userData.tipo_contrato = userData.tipo_contrato;
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
        this.form.segmento_contrato = userData.segmento_contrato || "";
        const pdfGuardado = userData.descripcion_cargo || "";
        this.form.otroSi = userData.otro_si || "";
        this.form.tipo_contrato = userData.tipo_contrato || "";
        this.form.correoAprendizaje   = userData.correoAprendizaje   || "";
        this.form.curso = userData.curso || "";
        this.form.institucion = userData.institucion || "";
        this.form.nitInstitucion = userData.nitinstitucion || "";
        this.form.centroSena = userData.centroSena || "";
        userData.fechaterminacion = userData.fechaterminacion 
              ? userData.fechaterminacion.split("T")[0] 
              : ""; // <--- Esto hace que se vea en el HTML

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

        // 1. Sincronizar lo que viene del select y campos superiores (que usan 'form')
        this.usuarioActual.ciudad = this.form.ciudad;
        this.usuarioActual.cargo = this.form.cargo;
        this.usuarioActual.salario = this.form.salario;
        this.usuarioActual.tipo_contrato = this.form.tipo_contrato;

        // 2. ¡IMPORTANTE! NO IGUALAR A 'THIS.FORM' LOS CAMPOS DE APRENDIZAJE
        // Porque en tu HTML ya usas v-model="usuarioActual.XXXX".
        // Si haces: this.usuarioActual.curso = this.form.curso, lo vas a borrar (porque form.curso no existe).

        // Si quieres estar 100% seguro de que el objeto va completo,
        // simplemente no toques estas variables aquí, Vue ya las actualizó.

        const response = await fetch(
          `${API_URL}/usuario/${this.usuarioActual.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(this.usuarioActual), // Aquí ya van llenos curso, nit, etc.
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
          this.obtenerListaUsuarios();
        } else {
          throw new Error(data.message);
        }
      } catch (error) {
        console.error(error);
        Swal.fire("Error", "No se pudieron guardar: " + error.message, "error");
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

      // Si el usuario cancela, detenemos todo aquí
      if (!result.isConfirmed) return;

      try {
        Swal.showLoading();

        // 2. Sincronizar datos del formulario al objeto que se enviará
        // Asegúrate de que 'this.usuarioActual' tenga el ID correcto
        const datosActualizados = {
          ...this.usuarioActual,
          cargo: this.form.cargo,
          salario: this.form.salario,
          ciudad: this.form.ciudad,
          observaciones: this.form.observaciones,
          segmento_contrato: this.form.segmento_contrato,
          descripcion_cargo: this.form.descripcion_cargo,
          correoAprendizaje  : this.form.correoAprendizaje  ,
          correoAprendizaje  : this.form.correoAprendizaje  ,
          curso: this.form.curso,
          institucion: this.form.institucion,
          nitinstitucion: this.form.nitInstitucion,
          centroSena: this.form.centroSena,
          fechaterminacion: this.form.fechaterminacion,
          aprobacion: 1, // Este es el que activa el cambio en DB
        };

        // 3. PASO PRINCIPAL: Guardar en la Base de Datos
        const response = await fetch(
          `${API_URL}/usuario/${this.usuarioActual.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datosActualizados),
          },
        );

        if (!response.ok)
          throw new Error("Error en la respuesta del servidor al guardar");

        const data = await response.json();

        // 4. Si el guardado fue exitoso, procedemos con las notificaciones
        if (data.status === "ok") {
          // Actualizamos el objeto local para que la UI refleje el cambio
          Object.assign(this.usuarioActual, datosActualizados);

          // 5. Lanzar notificaciones (usamos una técnica que no bloquea si el mail falla)
          this.enviarNotificaciones(this.usuarioActual.id);

          Swal.fire({
            icon: "success",
            title: "¡Aprobado!",
            text: "El contrato ha sido guardado y las notificaciones están en proceso.",
            timer: 2000,
          });

          // Recargar la lista principal
          if (typeof this.obtenerListaUsuarios === "function") {
            this.obtenerListaUsuarios();
          }
        } else {
          throw new Error(data.message || "No se pudo actualizar el registro");
        }
      } catch (error) {
        console.error("Error crítico en aprobar():", error);
        Swal.fire("Error", "No se pudo aprobar: " + error.message, "error");
      }
    },

    // Función auxiliar para no ensuciar el método principal
    async enviarNotificaciones(id) {
      try {
        // Notificación al Usuario
        fetch(`${API_URL}/notificar-aprobacion`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });

        // Notificación a Nómina
        fetch(`${API_URL}/notificar-nomina`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
      } catch (e) {
        console.error("Error enviando correos en segundo plano:", e);
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
