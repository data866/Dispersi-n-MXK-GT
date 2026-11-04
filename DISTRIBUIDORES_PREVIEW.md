# Distribuidores con una sesión central — solo Preview

El portal `demo/acceso-sobre-dashboard-original` incluye el módulo original de Distribuidores como dependencia Git fijada al commit de `feat/sesion-central-guatemala`. No se consultan sus rutas Production ni se desactiva la protección de despliegues de Vercel. No se requiere compartir cookies, secretos o tokens de Google entre sitios.

El iframe conserva el HTML, CSS, gráficos, cálculos y datos del módulo original. Se sirve por `/modules/distribuidores/Distribuidores.html`. Cada solicitud a sus APIs exige la cookie central HttpOnly y el permiso de Distribuidores de la matriz privada.

El servidor crea un contexto interno no serializable por HTTP (una propiedad Symbol) únicamente después de validar la sesión. Los handlers originales de Distribuidores reciben ese contexto y vuelven a aplicar su whitelist mediante `accessFor()` y sus límites de PII. El contexto solo se admite en la rama Preview exacta del portal. Cabeceras, cuerpo, parámetros o cookies proporcionados por el navegador no pueden crear ese contexto.

Solo se sirven dos archivos estáticos explícitos y seis APIs originales de consulta. No se exponen los módulos de datos privados ni operaciones de escritura. La administración se conserva en el portal, exclusiva de data@maxikash.mx y en modo consulta.

Cerrar sesión elimina la cookie; las siguientes solicitudes al módulo devuelven 401. Los datos ya entregados al navegador no se pueden retirar retroactivamente.

No se modifican las listas de usuarios, permisos, consultas ni almacenamiento de Production. Cartera conserva su integración anterior y requiere una etapa separada.
