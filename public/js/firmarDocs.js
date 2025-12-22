
    const { createApp } = Vue;

    createApp({
        data() {
            return {
                token: '',
                loading: true,
                enviado: false,
                error: null,
                usuario: { nombres: '' },
                archivos: []            
            }
        },
        mounted() {
            const params = new URLSearchParams(window.location.search);
            this.token = params.get('token');
            if (!this.token) { 
                this.error = "No se encontró un token de acceso."; 
                this.loading = false; 
                return; 
            }
            this.validarToken();
        },
        methods: {
            triggerFileInput() { this.$refs.archivoInput.click(); },
            
            handleFileSelect(event) {
                const nuevos = Array.from(event.target.files);
                this.archivos = [...this.archivos, ...nuevos];
                event.target.value = ''; // Reset input
            },

            eliminarArchivo(index) {
                this.archivos.splice(index, 1);
            },

            async validarToken() {
                try {
                    const res = await fetch(`/api/validar-token-firma/${this.token}`);
                    const data = await res.json();
                    if (data.status === 'ok') { 
                        this.usuario = data.usuario; 
                        this.loading = false;
                    } else { 
                        this.error = data.message;
                        this.loading = false;
                    }
                } catch (e) { 
                    this.error = "Error de comunicación con el servidor."; 
                    this.loading = false;
                }
            },

            async procesarSubida() {
                if (this.archivos.length === 0) return;
                
                Swal.fire({
                    title: 'Subiendo Documentos',
                    html: 'Estamos procesando tus firmas, espera un momento...',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading() }
                });

                const formData = new FormData();
                formData.append('token', this.token);
                this.archivos.forEach(file => {
                    formData.append('archivos', file); // 'archivos' debe coincidir con upload.any() o upload.array('archivos')
                });

                try {
                    const res = await fetch(`/api/subir-firmados`, {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();
                    
                    if (data.status === 'ok') {
                        Swal.close();
                        this.enviado = true;
                    } else {
                        throw new Error(data.message);
                    }
                } catch(e) {
                    Swal.fire('Error', e.message || 'Fallo al subir los archivos.', 'error');
                }
            }
        }
    }).mount('#app');
