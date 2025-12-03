import { onRequest as __api_auth_google_callback_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\auth\\google\\callback.ts"
import { onRequest as __api_examples__id__image_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\examples\\[id]\\image.ts"
import { onRequest as __api_sources__id__chunks_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\sources\\[id]\\chunks.ts"
import { onRequest as __api_admin_users_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\admin\\users.ts"
import { onRequest as __api_auth_google_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\auth\\google.ts"
import { onRequest as __api_auth_me_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\auth\\me.ts"
import { onRequest as __api_auth_signin_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\auth\\signin.ts"
import { onRequest as __api_auth_signout_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\auth\\signout.ts"
import { onRequest as __api_keys_ollama_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\keys\\ollama.ts"
import { onRequest as __api_ollama_generate_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\ollama\\generate.ts"
import { onRequest as __api_ollama_test_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\ollama\\test.ts"
import { onRequest as __api_examples__id__ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\examples\\[id].ts"
import { onRequest as __api_keys__id__ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\keys\\[id].ts"
import { onRequest as __api_sources__id__ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\sources\\[id].ts"
import { onRequest as __api_examples_index_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\examples\\index.ts"
import { onRequest as __api_keys_index_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\keys\\index.ts"
import { onRequest as __api_sources_index_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\sources\\index.ts"
import { onRequest as __api_system_prompt_ts_onRequest } from "C:\\Users\\shuff\\OneDrive\\Documents\\GitHub\\11Gauge\\functions\\api\\system-prompt.ts"

export const routes = [
    {
      routePath: "/api/auth/google/callback",
      mountPath: "/api/auth/google",
      method: "",
      middlewares: [],
      modules: [__api_auth_google_callback_ts_onRequest],
    },
  {
      routePath: "/api/examples/:id/image",
      mountPath: "/api/examples/:id",
      method: "",
      middlewares: [],
      modules: [__api_examples__id__image_ts_onRequest],
    },
  {
      routePath: "/api/sources/:id/chunks",
      mountPath: "/api/sources/:id",
      method: "",
      middlewares: [],
      modules: [__api_sources__id__chunks_ts_onRequest],
    },
  {
      routePath: "/api/admin/users",
      mountPath: "/api/admin",
      method: "",
      middlewares: [],
      modules: [__api_admin_users_ts_onRequest],
    },
  {
      routePath: "/api/auth/google",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_google_ts_onRequest],
    },
  {
      routePath: "/api/auth/me",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_me_ts_onRequest],
    },
  {
      routePath: "/api/auth/signin",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_signin_ts_onRequest],
    },
  {
      routePath: "/api/auth/signout",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_signout_ts_onRequest],
    },
  {
      routePath: "/api/keys/ollama",
      mountPath: "/api/keys",
      method: "",
      middlewares: [],
      modules: [__api_keys_ollama_ts_onRequest],
    },
  {
      routePath: "/api/ollama/generate",
      mountPath: "/api/ollama",
      method: "",
      middlewares: [],
      modules: [__api_ollama_generate_ts_onRequest],
    },
  {
      routePath: "/api/ollama/test",
      mountPath: "/api/ollama",
      method: "",
      middlewares: [],
      modules: [__api_ollama_test_ts_onRequest],
    },
  {
      routePath: "/api/examples/:id",
      mountPath: "/api/examples",
      method: "",
      middlewares: [],
      modules: [__api_examples__id__ts_onRequest],
    },
  {
      routePath: "/api/keys/:id",
      mountPath: "/api/keys",
      method: "",
      middlewares: [],
      modules: [__api_keys__id__ts_onRequest],
    },
  {
      routePath: "/api/sources/:id",
      mountPath: "/api/sources",
      method: "",
      middlewares: [],
      modules: [__api_sources__id__ts_onRequest],
    },
  {
      routePath: "/api/examples",
      mountPath: "/api/examples",
      method: "",
      middlewares: [],
      modules: [__api_examples_index_ts_onRequest],
    },
  {
      routePath: "/api/keys",
      mountPath: "/api/keys",
      method: "",
      middlewares: [],
      modules: [__api_keys_index_ts_onRequest],
    },
  {
      routePath: "/api/sources",
      mountPath: "/api/sources",
      method: "",
      middlewares: [],
      modules: [__api_sources_index_ts_onRequest],
    },
  {
      routePath: "/api/system-prompt",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_system_prompt_ts_onRequest],
    },
  ]