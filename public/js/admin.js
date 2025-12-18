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
async vincularPdfAlExpediente() {
    // Validaciones iniciales
    if (!this.usuarioActual || !this.form.descripcion_cargo) {
        Swal.fire("Atención", "Seleccione primero la descripción del cargo arriba.", "warning");
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
                segmento: this.form.segmento_contrato // Importante para saber en qué subcarpeta de S3 buscar
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
            Swal.fire("Error", data.message || "No se pudo copiar el archivo", "error");
        }
    } catch (error) {
        console.error("Error en vinculación:", error);
        Swal.fire("Error", "No hay conexión con el servicio de documentos.", "error");
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
        Swal.fire("Atención", "Selecciona primero la Descripción del Cargo en el paso anterior.", "warning");
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
                segmento: this.form.segmento_contrato
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
}
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
      usuarios: [],
      selectedId: "",
      usuarioActual: null,

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
    usuariosFiltrados() {
      if (!this.busqueda) return this.usuarios;
      const texto = this.busqueda.toLowerCase();
      return this.usuarios.filter(
        (u) =>
          (u.nombres && u.nombres.toLowerCase().includes(texto)) ||
          (u.apellidos && u.apellidos.toLowerCase().includes(texto)) ||
          (u.documento && u.documento.includes(texto))
      );
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
      const { value: motivo } = await Swal.fire({
        title: "Solicitar Corrección",
        input: "textarea",
        inputPlaceholder: "Indica qué documento está mal...",
        showCancelButton: true,
        confirmButtonColor: "#ffc107",
        confirmButtonText: "Enviar",
      });

      if (motivo) {
        Swal.showLoading();
        try {
          const res = await fetch(`${API_URL}/solicitar-subsanar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: this.usuarioActual.id, motivo }),
          });
          const data = await res.json();
          if (data.status === "ok")
            Swal.fire("Enviado", "Correo enviado al usuario", "success");
          else Swal.fire("Error", data.message, "error");
        } catch (e) {
          Swal.fire("Error", "Fallo de red", "error");
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
        this.usuarioActual.aprobacion = 1;

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
