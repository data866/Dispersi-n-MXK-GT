# Caducidad de la sesión central

- El servidor rechaza la sesión después de 300 segundos sin actividad y no permite renovar una sesión vencida.
- Solo los eventos de usuario renuevan el plazo mediante POST del mismo origen. Los GET de datos, sondeos y refrescos automáticos no lo renuevan.
- Se detecta actividad en el portal y en el iframe de Distribuidores, servido en el mismo origen. Se coordinan las pestañas abiertas para que una pestaña inactiva no cierre otra que está en uso.
- La cookie de autenticación es Secure, HttpOnly, SameSite=Lax y de sesión: no contiene Max-Age ni Expires. El borrado sí usa Max-Age=0. Chrome puede restaurar cookies de sesión si recupera la sesión anterior; el límite del servidor sigue aplicándose.
- Se mantiene el límite absoluto previo de una hora y el vencimiento del ID token de Google. Ni la actividad ni los mensajes entre pestañas pueden ampliar ese límite.
- Las cookies anteriores a esta actualización se rechazan; será necesario iniciar sesión de nuevo una vez.
- Cartera conserva su autenticación independiente. La política central no modifica sus APIs ni puede observar actividad dentro de ese iframe externo.

Las pruebas usan cuentas ficticias y reloj simulado. No se modifican usuarios, permisos, consultas, datos o almacenamiento.
