import {getVercelOidcToken} from '@vercel/oidc';
export async function previewWorkloadToken(){
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='demo/acceso-sobre-dashboard-original')return null;
 try{return await getVercelOidcToken()||null;}catch{return null;}
}
