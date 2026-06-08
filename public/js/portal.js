/* PORTAL COLABORADOR — Login JS */

(function () {
  "use strict";

  // Verificar si ya hay sesión activa → redirigir al dashboard
  fetch("/api/portal/sesion")
    .then(r => r.json())
    .then(data => { if (data.activo) window.location.href = "/portal/inicio"; })
    .catch(() => {});

  const form       = document.getElementById("form-acceso");
  const btnText    = document.getElementById("btn-text");
  const btnLoading = document.getElementById("btn-loading");
  const btnIngresar= document.getElementById("btn-ingresar");
  const msgError   = document.getElementById("msg-error");
  const inputDoc   = document.getElementById("documento");
  const inputFecha = document.getElementById("fechaNacimiento");

  // Solo dígitos en el campo cédula
  inputDoc.addEventListener("input", () => {
    inputDoc.value = inputDoc.value.replace(/\D/g, "");
  });

  function setLoading(v) {
    btnText.style.display    = v ? "none"         : "flex";
    btnLoading.style.display = v ? "inline-flex"  : "none";
    btnIngresar.disabled     = v;
  }

  function showError(msg) {
    msgError.textContent    = msg;
    msgError.style.display  = "flex";
    [inputDoc, inputFecha].forEach(el => el.classList.add("error"));
  }

  function clearError() {
    msgError.style.display = "none";
    msgError.textContent   = "";
    [inputDoc, inputFecha].forEach(el => el.classList.remove("error"));
  }

  function mostrarBloqueado() {
    document.getElementById("view-login").style.display     = "none";
    document.getElementById("view-bloqueado").style.display = "block";
  }

  // Exponemos para el botón "Intentar de nuevo"
  window.mostrarLogin = function () {
    document.getElementById("view-login").style.display     = "block";
    document.getElementById("view-bloqueado").style.display = "none";
    clearError();
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const documento      = inputDoc.value.trim();
    const fechaNacimiento = inputFecha.value.trim();

    // Validación básica en cliente
    if (!documento || documento.length < 5) {
      showError("Ingresa un número de cédula válido.");
      inputDoc.focus();
      return;
    }
    if (!fechaNacimiento) {
      showError("Ingresa tu fecha de nacimiento.");
      inputFecha.focus();
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/portal/acceso", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ documento, fechaNacimiento }),
        credentials: "same-origin",
      });

      const data = await res.json();

      if (res.status === 429) {
        mostrarBloqueado();
        return;
      }

      if (!res.ok || !data.ok) {
        showError(data.error || "Datos incorrectos. Verifica tu información.");
        setLoading(false);
        return;
      }

      // Éxito → redirigir
      window.location.href = data.redirect || "/portal/inicio";

    } catch (err) {
      showError("Error de conexión. Verifica tu internet e intenta de nuevo.");
      setLoading(false);
    }
  });

})();
