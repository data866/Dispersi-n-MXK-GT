# Acceso real del dashboard original — solo Preview

Rama: `demo/acceso-sobre-dashboard-original`. No modifica los repositorios de los módulos.

El navegador entrega el ID token de Google a `/api/auth`. La biblioteca oficial verifica firma, emisor, audiencia y vencimiento. Se exige correo verificado y nonce ligado a una cookie de desafío firmada. Los POST requieren el origen exacto del Preview y JSON.

La sesión firmada dura como máximo una hora y nunca supera el vencimiento del ID token. Su cookie `__Host-mxkgt` es Secure, HttpOnly, SameSite=Lax, sin Domain. La API de datos exige esa sesión y vuelve a consultar la matriz del servidor en cada solicitud.

Variables exclusivas de esta rama: `GOOGLE_CLIENT_ID`, `MXK_SESSION_SECRET`, `MXK_ACCESS_POLICY`. La matriz privada conserva los 27 correos, 13 accesos de Distribuidores, 18 de Cartera y 8 descargas. No se almacena en archivos públicos ni se permite editarla desde estas APIs.

Solo `data@maxikash.mx` puede consultar el panel de permisos. Las operaciones de escritura están deshabilitadas en esta etapa. Los administradores de consulta no adquieren administración de accesos.

El dashboard y sus cálculos, filtros, gráficas, tablas y destinos de módulos siguen originales. Solo se cambia su arranque: primero se valida la sesión, después se cargan los scripts originales. El acceso azul y blanco usa el diseño aprobado y el botón real de Google.

Pendiente de la siguiente etapa: intercambio seguro de sesión con los Preview de Distribuidores y Cartera. Las cookies no se comparten entre subdominios vercel.app; no se elimina la validación de sus APIs. No se envían tokens a los destinos Production existentes.
