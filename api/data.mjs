export default function handler(req,res){res.setHeader('Cache-Control','no-store');res.status(410).json({demo:true,error:'Demostración sin datos reales. No se consulta Sheets.'});}
