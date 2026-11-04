# Distribuidores con la sesión del portal

Solo se integra el Preview `feat/sesion-central-guatemala` de Distribuidores desde `demo/acceso-sobre-dashboard-original` del portal.

El iframe mantiene el HTML, CSS, gráficas y cálculos originales. Se sirve por `/modules/distribuidores/Distribuidores.html`. Las solicitudes de datos usan esa misma ruta del portal y su cookie HttpOnly. Cada solicitud vuelve a comprobar la sesión y el permiso de Distribuidores de la matriz privada.

El servidor del portal firma una autorización Ed25519 para una única ruta GET, con duración máxima de 30 segundos y sin exceder el vencimiento de la sesión. Solo el servidor de Distribuidores recibe esa autorización. El navegador no recibe tokens de Google, claves ni autorizaciones reutilizables del módulo.

Distribuidores verifica firma, emisor, audiencia, ruta, método, vencimiento y rama Preview, y después aplica `accessFor()` con sus permisos originales. No acepta tokens del portal como si fueran tokens de Google. La clave privada solo existe en el Preview del portal; la clave pública solo se configura en la nueva rama de Distribuidores.

El proxy admite una lista explícita de rutas de consulta; no permite archivos privados, redirecciones ni operaciones de escritura. La administración se conserva en el portal y permanece en modo consulta. No hay altas, bajas, cambios de permisos o pruebas de Blob. No se utilizan credenciales ni almacenamiento de Production.

Cerrar sesión elimina la cookie central. Las siguientes solicitudes al módulo devuelven 401. Los datos ya entregados al navegador no se pueden retirar retroactivamente.

`tests/central-session-copy.mjs` es una copia exacta del verificador de la rama de Distribuidores para ejecutar las pruebas de integración entre repositorios sin exponer datos o usar cuentas reales.

Cartera conserva su integración anterior. Esta etapa no la modifica.

## Estado de verificación

El Preview del portal compila y conserva el dashboard original. La comunicación con el Preview de Distribuidores está bloqueada por Vercel Authentication. La alternativa de incluir el módulo original durante la compilación requiere acceso de lectura a su repositorio privado. No se copian archivos privados al repositorio público del portal y no se desactiva Deployment Protection. La conexión completa permanece pendiente de ese permiso.
