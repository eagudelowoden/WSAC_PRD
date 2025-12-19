document
  .getElementById("formularioRegistro")
  .addEventListener("submit", async function (e) {
    e.preventDefault();
    const formData = new FormData(this);
    const PORT = "";
    const URL_BASE = "";

    try {
      Swal.fire({
        title: "Enviando...",
        text: "Subiendo documentos y datos...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const response = await fetch(`${URL_BASE}/api/enviar`, {
        method: "POST",
        body: formData,
      });

      const textResponse = await response.text();
      console.log("Respuesta:", textResponse);

      let data;
      try {
        data = JSON.parse(textResponse);
      } catch (jsonError) {
        throw new Error("El servidor no devolvió JSON.");
      }

      if (response.ok && data.status === "ok") {
        Swal.fire({
          icon: "success",
          title: "¡Recibido!",
          text: data.message,
          confirmButtonText: "Aceptar",
          confirmButtonColor: "#4e73df",
        }).then(() => {
          document.getElementById("formularioRegistro").reset();
        });
      } else {
        throw new Error(data.message || "Error desconocido");
      }
    } catch (error) {
      console.error("ERROR:", error);
      Swal.fire({
        icon: "error",
        title: "Ups...",
        text: error.message,
        confirmButtonColor: "#e74a3b",
      });
    }
  });
