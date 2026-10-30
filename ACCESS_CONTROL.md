# Acceso restringido antes de producción

Este dashboard muestra nombres reales en las tablas y en los archivos Excel. No debe publicarse en un dominio accesible sin autenticación.

## Configuración requerida en Vercel

1. En el proyecto `dispersi-n-mxk-gt`, abrir **Security → Deployment Protection**.
2. Seleccionar **Vercel Authentication** y el alcance **All Deployments**. Así quedan protegidos tanto el dominio de producción como las vistas previas.
3. Conceder acceso al proyecto de Vercel únicamente al personal autorizado; retirar miembros que ya no lo requieran.
4. No crear enlaces compartibles de bypass para datos con nombres reales.

## Verificación previa a la fusión

Desde una sesión sin iniciar sesión en Vercel, comprobar que `/`, `/api/data` y `/data.json` solicitan autenticación y no devuelven datos. Desde la cuenta autorizada, comprobar que las cuatro pestañas y las exportaciones Excel muestran exactamente los nombres de la fuente.

## Fuente de datos

La protección de Vercel no protege una fuente de Apps Script que pueda consultarse directamente y entregue nombres reales. Esta rama no cambia Apps Script ni sus automatizaciones. Antes de publicar, el responsable de la fuente debe confirmar que su URL no puede revelar nombres a personas no autorizadas, o aprobar un cambio separado para restringirla. Hasta entonces, no se debe fusionar ni publicar producción con nombres reales.
