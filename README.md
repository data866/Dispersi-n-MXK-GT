# MAXIKASH GT · prueba pública con Google Sheets

Destino autorizado: proyecto EXISTENTE Vercel dispersi-n-mxk-gt, repositorio data866/Dispersi-n-MXK-GT. No se crea otro proyecto, no se configura Google Cloud, no hay autenticación ni credenciales en el navegador.

La función Apps Script existente construirDatosVercel_ conserva toda la lectura y lógica validada. Public_API.gs añade una salida explícitamente agregada. Se actualizó la implementación existente después de confirmar el cambio de Solo yo a Cualquiera. El Sheets sigue privado. No se entregan clientes, documentos, correos, teléfonos, identificadores de solicitud/oferta/flujo ni nombres de empleados. Los usuarios se muestran como Usuario 1, Usuario 2, etc.; esas etiquetas no deben tratarse como identificadores estables entre cortes.

Vercel consulta Apps Script desde api/data.mjs usando SHEETS_PUBLIC_URL y rechaza campos inesperados antes de responder al navegador. La URL de la fuente no es un secreto: su respuesta pública debe ser apta para publicación por sí misma. El intermediario público no acepta nombres de funciones ni rangos arbitrarios.

El CSS y las cuatro pestañas originales se conservan. Se mantienen las tarjetas históricas, tabla diaria de solicitudes, resumen semanal, distribuidor/sucursal/usuario, inventario y dos tablas de detalle. Detalle ahora contiene agrupaciones y contadores, sin filas de personas; los encabezados personales e identificadores se sustituyen por los de agregados. Se añaden filtros de mes/distribuidor/sucursal. Nunca se usa el número de grupos como número de solicitudes: se suman los conteos.

Venta Total y Total Motos corresponden al mes seleccionado y responden a distribuidor y sucursal. Las cinco tarjetas de solicitudes mantienen el histórico. La activación se determina exclusivamente por fecha válida y suma monto_financiar, independientemente de etapa. Meta general corresponde al mes y no se reparte por distribuidor ni sucursal, porque la fuente no tiene ese desglose. Proyección = venta del mes hasta el día de corte / días calendario transcurridos × días calendario del mes. Mes cerrado equivale a venta; futuro muestra —. Factor permanece — porque el original no tenía fórmula definida.

La pantalla consulta al abrirse, cada 5 minutos mientras está visible y al volver a la pestaña. Cada consulta lee las hojas actuales. Esto automatiza Sheets → dashboard, NO certifica ni modifica la automatización previa que alimenta Sheets desde MySQL/CSV. Si falla la lectura, se informa el error y se conserva el corte anterior visible con su fecha; no se inventan cifras ni se recurre al snapshot MySQL.

La ruta antigua /data.json se redirige a la nueva API agregada. El archivo estático anterior se retira del árbol actual. Eso NO elimina commits, descargas ni despliegues históricos: no se ha autorizado ni ejecutado una purga destructiva. El JSON antiguo versionado revisado no tenía nombres/documentos en los campos examinados, pero contenía datos operativos. Los scripts antiguos de MySQL se deshabilitan para evitar regenerar datos personales en public/.

Los desgloses diarios y por sucursal pueden tener grupos pequeños. No son registros identificados, pero no se garantiza anonimato frente a información externa. Esta es una publicación de pruebas aprobada; ser el único usuario previsto no hace privado un sitio sin autenticación.

Plan observado en Vercel: Hobby. No se cambió el plan ni se contrató nada. Debe revisarse su adecuación antes de uso empresarial permanente.

Pruebas: node test-public-api.cjs y npm test. Con MX_LIVE_SNAPSHOT apuntando a una copia local de la salida real, se verificó el corte 9645 solicitudes (2838/6426/381), 230 motos, Q2057850; octubre 53 motos, Q453550 y meta Q850000 con tolerancia de centavos por suma flotante. Se verificaron esquema público, exclusión de campos privados, rechazo ante configuración ausente, CSS original, cuatro pestañas, filtros y proyección. Sin esa variable, la prueba del corte real se omite: no sustituye la lectura por valores sintéticos.

No es una auditoría externa de seguridad ni una garantía de anonimato. La revisión de los antiguos despliegues y su retirada sigue siendo un trabajo separado.
