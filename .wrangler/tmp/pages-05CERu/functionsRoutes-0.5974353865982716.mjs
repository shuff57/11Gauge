import { onRequest as __api_auth_google_callback_ts_onRequest } from "C:\\Users\\shuff\\Documents\\GitHub\\11Gauge\\functions\\api\\auth\\google\\callback.ts"
import { onRequest as __api_auth_google_ts_onRequest } from "C:\\Users\\shuff\\Documents\\GitHub\\11Gauge\\functions\\api\\auth\\google.ts"
import { onRequest as __api_auth_me_ts_onRequest } from "C:\\Users\\shuff\\Documents\\GitHub\\11Gauge\\functions\\api\\auth\\me.ts"
import { onRequest as __api_auth_signin_ts_onRequest } from "C:\\Users\\shuff\\Documents\\GitHub\\11Gauge\\functions\\api\\auth\\signin.ts"
import { onRequest as __api_auth_signout_ts_onRequest } from "C:\\Users\\shuff\\Documents\\GitHub\\11Gauge\\functions\\api\\auth\\signout.ts"
import { onRequest as __api_keys_ollama_ts_onRequest } from "C:\\Users\\shuff\\Documents\\GitHub\\11Gauge\\functions\\api\\keys\\ollama.ts"
import { onRequest as __api_ollama_generate_ts_onRequest } from "C:\\Users\\shuff\\Documents\\GitHub\\11Gauge\\functions\\api\\ollama\\generate.ts"
import { onRequest as __api_ollama_test_ts_onRequest } from "C:\\Users\\shuff\\Documents\\GitHub\\11Gauge\\functions\\api\\ollama\\test.ts"
import { onRequest as __api_keys__id__ts_onRequest } from "C:\\Users\\shuff\\Documents\\GitHub\\11Gauge\\functions\\api\\keys\\[id].ts"
import { onRequest as __api_keys_index_ts_onRequest } from "C:\\Users\\shuff\\Documents\\GitHub\\11Gauge\\functions\\api\\keys\\index.ts"

export const routes = [
    {
      routePath: "/api/auth/google/callback",
      mountPath: "/api/auth/google",
      method: "",
      middlewares: [],
      modules: [__api_auth_google_callback_ts_onRequest],
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
      routePath: "/api/keys/:id",
      mountPath: "/api/keys",
      method: "",
      middlewares: [],
      modules: [__api_keys__id__ts_onRequest],
    },
  {
      routePath: "/api/keys",
      mountPath: "/api/keys",
      method: "",
      middlewares: [],
      modules: [__api_keys_index_ts_onRequest],
    },
  ]