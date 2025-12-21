// Objeto global para guardar los archivos
const storageArchivos = {};

// Inicializar los campos que tienen la clase 'input-acumulador'
document.querySelectorAll('.input-acumulador').forEach(input => {
    const fieldName = input.name;
    storageArchivos[fieldName] = []; 

    input.addEventListener('change', function(e) {
        // Convertimos la lista de archivos actual en un Array
        const filesSelected = Array.from(e.target.files);
        const container = document.getElementById(`list-${fieldName}`);

        if (!container) {
            console.error(`Error: No existe un div con id "list-${fieldName}" para mostrar los archivos.`);
            return;
        }

        filesSelected.forEach(file => {
            // Evitar duplicados por nombre y tamaño
            const yaExiste = storageArchivos[fieldName].some(f => f.name === file.name && f.size === file.size);
            
            if (!yaExiste) {
                storageArchivos[fieldName].push(file);
                
                // Crear visualización
                const item = document.createElement('div');
                item.className = 'file-item';
                item.style.display = "flex";
                item.style.justifyContent = "space-between";
                item.style.marginBottom = "5px";
                item.style.padding = "8px";
                item.style.background = "#f0f2f5";
                item.style.borderRadius = "5px";

                item.innerHTML = `
                    <span><i class="bi bi-file-earmark-check"></i> ${file.name}</span>
                    <i class="bi bi-x-circle-fill text-danger" style="cursor:pointer" onclick="quitarArchivo('${fieldName}', '${file.name}', this)"></i>
                `;
                container.appendChild(item);
            }
        });

        // IMPORTANTE: Esto limpia el input visualmente para que 
        // NO se reemplacen en la siguiente selección.
        input.value = ""; 
    });
});

// Función para quitar archivos de la lista
window.quitarArchivo = function(fieldName, fileName, element) {
    storageArchivos[fieldName] = storageArchivos[fieldName].filter(f => f.name !== fileName);
    element.parentElement.remove();
};

// Manejo del SUBMIT
document.getElementById("formularioRegistro").addEventListener("submit", async function (e) {
    e.preventDefault();
    
    // Creamos el FormData desde el formulario
    const formData = new FormData(this);

    // Sobrescribimos los campos acumuladores con nuestros archivos guardados
    for (const fieldName in storageArchivos) {
        // Borramos lo que el navegador crea por defecto
        formData.delete(fieldName); 
        // Metemos nuestros archivos uno por uno
        storageArchivos[fieldName].forEach(file => {
            formData.append(fieldName, file);
        });
    }

    // --- LOG PARA DEPURACIÓN (Míralo en la consola F12) ---
    console.log("Archivos que se enviarán:");
    for (let pair of formData.entries()) {
        console.log(pair[0] + ': ' + (pair[1] instanceof File ? pair[1].name : pair[1]));
    }

    // ... Aquí sigue tu código de SweetAlert y Fetch ...
    try {
        Swal.fire({
            title: "Enviando...",
            text: "Subiendo documentos y datos...",
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
        });

        const response = await fetch("/api/enviar", {
            method: "POST",
            body: formData,
        });

        const data = await response.json();

        if (response.ok && data.status === "ok") {
            Swal.fire("¡Éxito!", data.message, "success").then(() => {
                window.location.reload();
            });
        } else {
            throw new Error(data.message || "Error en el servidor");
        }
    } catch (error) {
        Swal.fire("Error", error.message, "error");
    }
});