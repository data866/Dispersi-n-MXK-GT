# Dispersión MXK GT

Proyecto independiente que sustituye el reporte **Dispersión MXK GT** de Looker Studio.

No hace consultas a MySQL cuando una persona abre la página. Una tarea programada en esta PC genera `public/data.json`, cierra la conexión al terminar y publica el resultado mediante Git/Vercel.

## Fuentes migradas

- `GT_solicitudes` (MySQL): solicitudes, aprobación, rechazos y sin proceso.
- `GT_ofertas` (MySQL): ofertas, activaciones, dispersiones e inventario por etapa.
- `GTPpto` (Google Sheets): metas diarias. Por ahora se conserva en `data/targets.json`; se agregan ahí las metas mensuales confirmadas.

## Actualización local

```powershell
python scripts/refresh.py
```

Las credenciales nunca se guardan en este repositorio. El script usa el `.env` local de este proyecto si existe; de lo contrario, solo en esta PC, usa el `.env` ya configurado para los datos GT.

