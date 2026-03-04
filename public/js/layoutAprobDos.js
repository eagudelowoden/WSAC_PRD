// js/layout.js
const NavbarComponent = {
    template: `
    <nav class="navbar navbar-custom px-3 py-1 shadow-sm justify-content-between" style="flex-shrink: 0; min-height: 40px;">
      
      <div class="d-flex align-items-center gap-4">
        <span class="navbar-brand mb-0 d-flex align-items-center gap-2">
          <i class="bi bi-building-gear fs-6"></i>
          <span class="small-brand">Gestión Área de Selección</span>
        </span>

        <div class="nav-modules d-flex gap-2 border-start ps-3" style="border-color: rgba(255,255,255,0.2) !important;">
          <a href="/panel-administrativo" class="text-decoration-none">
            <button class="btn-module" :class="{ 'active': activeModule === 'colaboradores' }">
              <i class="bi bi-people me-1"></i>
              <span class="d-none d-lg-inline">Colaboradores</span>
            </button>
          </a>

          <a href="/postulaciones" class="text-decoration-none">
            <button class="btn-module" :class="{ 'active': activeModule === 'postulaciones' }">
              <i class="bi bi-file-earmark-text me-1"></i>
              <span class="d-none d-lg-inline">Postulaciones</span>
            </button>
          </a>

          <a href="/agendamiento" class="text-decoration-none">
            <button class="btn-module" :class="{ 'active': activeModule === 'agendamiento' }">
              <i class="bi bi-calendar-event me-1"></i>
              <span class="d-none d-lg-inline">Agendamiento</span>
            </button>
          </a>
        </div>
      </div>

      <div class="d-flex align-items-center">
        <div class="dropdown">
          <button class="btn btn-link text-white text-decoration-none d-flex align-items-center gap-2 user-dropdown-btn py-0"
            type="button" @click="menuAbierto = !menuAbierto">

            <div class="avatar-circle-sm">
              {{ usuarioSys?.nombre?.charAt(0).toUpperCase() || '?' }}
            </div>

            <span class="extra-small d-none d-md-inline" v-if="usuarioSys && usuarioSys.nombre">
              {{ usuarioSys.nombre }}
            </span>
            <i class="bi bi-chevron-down x-small"></i>
          </button>

          <ul class="dropdown-menu dropdown-menu-end shadow border-0 mt-1" :class="{ 'show': menuAbierto }"
            style="position: absolute; right: 0; font-size: 0.8rem;">
            <li>
              <button class="dropdown-item text-danger d-flex align-items-center gap-2" @click="logout">
                <i class="bi bi-box-arrow-right"></i>
                <span>Cerrar Sesión</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </nav>
    `,
    props: ['activeModule', 'usuarioSys'],
    data() {
        return { 
            menuAbierto: false // IMPORTANTE: Cambiado de menuOpen a menuAbierto para coincidir con el @click del template
        }
    },
    methods: {
        logout() {
            // Usamos SweetAlert para confirmar el cierre de sesión si lo tienes disponible
            fetch('/api/logout', { method: 'POST' })
                .then(() => {
                    localStorage.removeItem('usuario');
                    localStorage.removeItem('token');
                    window.location.href = '/login.html';
                })
                .catch(err => console.error("Error al cerrar sesión:", err));
        }
    }
};