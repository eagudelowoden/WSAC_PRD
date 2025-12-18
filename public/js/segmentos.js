const PORT = process.env.PORT;
const URL_BASEDEV = process.env.URL_BASEDEV;

const SegmentosMixin = {
    data() {
        return {
            listaSegmentos: [],   // Llenará el primer Select
            listaCargosPDF: [],   // Llenará el segundo Select
            cargandoCargos: false
        }
    },
    mounted() {
        this.cargarSegmentos();
    },
    methods: {
        async cargarSegmentos() {
            try {
                // Ajusta la URL si es necesario
                const res = await fetch(`${URL_BASEDEV}/api/segmentos`);
                this.listaSegmentos = await res.json();
            } catch (e) {
                console.error("Error cargando segmentos:", e);
            }
        },

        async cargarCargosPorSegmento() {
            // Se ejecuta cuando el usuario cambia el Segmento
            const segmento = this.form.segmento_contrato; // Asumiendo que guardas esto en form
            
            this.listaCargosPDF = [];
            this.form.descripcion_cargo = ""; // Limpiar selección anterior
            
            if (!segmento) return;

            this.cargandoCargos = true;
            try {
                const res = await fetch(`${URL_BASEDEV}/api/cargos-por-segmento/${encodeURIComponent(segmento)}`);
                this.listaCargosPDF = await res.json();
            } catch (e) {
                console.error("Error cargando PDFs:", e);
            } finally {
                this.cargandoCargos = false;
            }
        }
    }
};