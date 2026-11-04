# Caducidad de la sesión central

- El servidor rechaza la sesión después de 300 segundos sin actividad y no permite renovar una sesión vencida.
- Solo los eventos de usuario renuevan el plazo mediante POST del mismo origen. Los GET de datos, sondeos y refrescos automáticos no lo renuevan.
- Se detecta actividad en el portal y en el iframe de Distribuidores, servido en el mismo origen. Se coordinan las pestañas abiertas para que una pestaña inactiva no cierre otra que está en uso.
- La cookie de autenticación es Secure, HttpOnly, SameSite=Lax y de sesión: no contiene Max-Age ni Expires. El borrado sí usa Max-Age=0. Chrome puede restaurar cookies de sesión si recupera la sesión anterior; el límite del servidor sigue aplicándose.
- Se mantiene el límite absoluto previo de una hora y el vencimiento del ID token de Google. Ni la actividad ni los mensajes entre pestañas pueden ampliar ese límite.
- Las cookies anteriores a esta actualización se rechazan; será necesario iniciar sesión de nuevo una vez.
- Cartera conserva su autenticación independiente. La política central no modifica sus APIs ni puede observar actividad dentro de ese iframe externo.

Las pruebas usan cuentas ficticias y reloj simulado. No se modifican usuarios, permisos, consultas, datos o almacenamiento.

## Cierre y reapertura de la página

Cada carga completa del portal borra primero la cookie central en el servidor y solicita un desafío nuevo de Google. No se entra automáticamente por una cookie restaurada por Chrome. Esto incluye recargar la página y abrir otra pestaña del portal; la cookie central compartida también afecta las otras pestañas. La navegación entre las siete pestañas internas y Distribuidores no recarga el documento y conserva el acceso único.

Después de validar Google se inicia el dashboard directamente, sin recargar la página. Al abandonar la página se oculta el contenido, se detiene la renovación y se intenta enviar el cierre con sendBeacon/keepalive. Una restauración desde la caché de navegación vuelve a exigir entrada nueva. El navegador no garantiza entregar solicitudes al cerrarse o ante un fallo; por eso la seguridad de la reapertura no depende de ese aviso. El servidor conserva además el vencimiento por inactividad de cinco minutos. No se cierra la cuenta de Google del navegador.
