const { createApp } = Vue;
// Usar ruta relativa: el backend sirve este archivo desde el mismo origen
const API_URL = "/api";



createApp({
    data() {
        return {
            selectedId: "",      
            listaUsuarios: [],   
            usuarioActual: null, 
            
            // Datos del formulario de contrato (estos no parecen estar en la tabla usuarios aun, se manejan localmente por ahora)
            form: {
                cargo: '',
                salario: '',
                observaciones: ''
            },
            
            archivos: [],
            cargandoArchivos: false
        }
    },
    mounted() {
        this.obtenerListaUsuarios();
    },
    methods: {
        // --------------------------------------------------------
        // 1. CARGAR LISTA DE USUARIOS (REAL)
        // --------------------------------------------------------
        async obtenerListaUsuarios() {
            try {
                const response = await fetch(`${API_URL}/usuarios`);
                
                if (!response.ok) throw new Error('Error al conectar con el servidor');
                
                const data = await response.json();
                this.listaUsuarios = data; // Asignamos los datos reales de la BD

            } catch (error) {
                console.error("Error:", error);
                Swal.fire('Error', 'No se pudo cargar la lista de usuarios. Revisa que el servidor (node) esté corriendo.', 'error');
            }
        },

        // --------------------------------------------------------
        // 2. CARGAR DETALLE + ARCHIVOS (REAL)
        // --------------------------------------------------------
        async cargarUsuarioDesdeBD() {
            // Si el usuario vuelve a "Seleccione...", limpiamos
            if (!this.selectedId) {
                this.usuarioActual = null;
                this.archivos = [];
                return;
            }

            this.cargandoArchivos = true;

            try {
                // A) Pedimos los datos del usuario
                const responseUser = await fetch(`${API_URL}/usuario/${this.selectedId}`);
                if (!responseUser.ok) throw new Error('Error obteniendo usuario');
                
                let userData = await responseUser.json();

                // IMPORTANTE: Mapeo de datos
                // La BD devuelve 'eps', pero el HTML espera 'epsNombre' (si no lo cambiaste).
                // Aquí ajustamos los nombres para que coincidan con tu HTML.
                userData.epsNombre = userData.eps; 
                userData.arlNombre = userData.arl;
                userData.afpNombre = userData.afp;
                userData.ccfNombre = userData.ccf;
                userData.otroSi = userData.otro_si;
                userData.tipo_contrato = userData.tipo_contrato;

                // Formatear fecha para que el input type="date" la lea bien (YYYY-MM-DD)
                if (userData.fechaNacimiento) {
                    userData.fechaNacimiento = userData.fechaNacimiento.split('T')[0];
                }

                this.usuarioActual = userData;

                // B) Pedimos los archivos usando el nombre de la carpeta que viene de la BD
                if (userData.carpeta) {
                    const responseFiles = await fetch(`${API_URL}/archivos/${userData.carpeta}`);
                    const filesData = await responseFiles.json();
                    
                    // Agregamos la ruta completa del servidor a la URL del archivo
                    this.archivos = filesData.map(f => ({
                        name: f.name,
                        url: f.url
                    }));
                } else {
                    this.archivos = [];
                }

            } catch (error) {
                console.error("Error trayendo usuario:", error);
                Swal.fire('Error', 'Falló la carga de datos del usuario', 'error');
            } finally {
                this.cargandoArchivos = false;
            }
        },

        // --------------------------------------------------------
        // 3. ACTUALIZAR DATOS PERSONALES (OPCIONAL)
        // --------------------------------------------------------
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
        this.usuarioActual.cargo = this.form.cargo;     // Opcional: si quieres actualizar cargo aquí también
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

        // --------------------------------------------------------
        // 4. ACCIONES DE CONTRATO
        // --------------------------------------------------------
        async aprobar() {
            if (!this.usuarioActual) return;

            const { isConfirmed } = await Swal.fire({
                title: '¿Confirmar contratación?',
                html: `Colaborador: <b>${this.usuarioActual.nombres} ${this.usuarioActual.apellidos}</b>`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#2ecc71',
                confirmButtonText: 'Sí, Aprobar'
            });
            if (!isConfirmed) return;

            try {
                Swal.showLoading();
                const res = await fetch(`${API_URL}/usuario/${this.usuarioActual.id}/estado`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ aprobacion: 3 }),
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    this.usuarioActual.aprobacion = 3;
                    Swal.fire('¡Aprobado!', 'Estado actualizado a Aprobado.', 'success');
                } else {
                    Swal.fire('Error', data.message || 'No se pudo actualizar el estado.', 'error');
                }
            } catch {
                Swal.fire('Error', 'Fallo de conexión con el servidor.', 'error');
            }
        },

        async rechazar() {
            if (!this.usuarioActual) return;

            const { value: motivo, isConfirmed } = await Swal.fire({
                title: 'Rechazar Candidato',
                input: 'textarea',
                inputPlaceholder: 'Motivo del rechazo...',
                showCancelButton: true,
                confirmButtonColor: '#e74c3c',
                confirmButtonText: 'Rechazar',
                inputValidator: (v) => !v && 'Debes escribir un motivo.',
            });
            if (!isConfirmed) return;

            try {
                Swal.showLoading();
                const res = await fetch(`${API_URL}/usuario/${this.usuarioActual.id}/estado`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ aprobacion: 4, observaciones: motivo }),
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    this.usuarioActual.aprobacion = 4;
                    Swal.fire('Registrado', 'Candidato marcado como rechazado.', 'info');
                } else {
                    Swal.fire('Error', data.message || 'No se pudo actualizar el estado.', 'error');
                }
            } catch {
                Swal.fire('Error', 'Fallo de conexión con el servidor.', 'error');
            }
        },

        // ... dentro de methods: { ...

        async solicitarCorreccion() {
        if (!this.usuarioActual) return;

        // 1. Pedir el motivo al Admin
        const { value: motivo } = await Swal.fire({
            title: 'Solicitar Corrección',
            input: 'textarea',
            inputLabel: '¿Qué documento está mal y por qué?',
            inputPlaceholder: 'Ej: La cédula está borrosa, favor subirla nuevamente.',
            showCancelButton: true,
            confirmButtonText: 'Enviar Solicitud',
            confirmButtonColor: '#ffc107', // Color amarillo
            cancelButtonText: 'Cancelar',
            inputValidator: (value) => {
                if (!value) {
                    return '¡Debes escribir un motivo!';
                }
            }
        });

        // Si el admin cancela, no hacemos nada
        if (!motivo) return;

        try {
            Swal.showLoading();

            // 2. Llamar al Backend
            const response = await fetch(`${API_URL}/solicitar-subsanar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: this.usuarioActual.id,
                    motivo: motivo
                })
            });

            const data = await response.json();

            if (data.status === 'ok') {
                Swal.fire('Enviado', 'Se ha enviado un correo al usuario con el enlace de corrección.', 'success');
            } else {
                Swal.fire('Error', data.message || 'No se pudo enviar la solicitud', 'error');
            }

        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'Fallo de conexión con el servidor', 'error');
        }
    },

// ... resto de métodos ...
    }
}).mount('#app');