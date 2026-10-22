# NEBUR — Reglas de arquitectura y estilo (backend `server/`)

Stack: TypeScript (Node) · Mongoose · Apollo GraphQL · MongoDB.
Estas reglas son **duras**. Si algo las viola, se corrige antes de dar una tarea por terminada.
Lo **mecánico** (líneas, complejidad, `any`, ciclos, copy-paste) lo hará cumplir ESLint (pendiente) + `jscpd`; lo **de criterio** (¿esta lógica ya existe?, ¿este type debería salir?) lo caza el Revisor.

**Alcance:** estas reglas aplican al **código que se crea o modifica** en cada tarea. El `any` y la deuda **legacy** ya existente se limpian en una barrida posterior con ESLint — el Revisor evalúa el **diff**, no todo el repo.
Aclaración: si el cambio **toca** una función, esa función se evalúa **completa** (tamaño, complejidad, responsabilidades), **no** solo las líneas nuevas — hacerla crecer hasta monstruo **sí** cuenta. Lo que no se tocó, queda fuera.

## 1. Tipado
- **Prohibido `any` y `unknown` como escape.** Nada de `(x as any)` ni `input: unknown` + cast. Si un tipo no se conoce, se **deriva** (`Pick<Doc>`, `InferSchemaType`) o se **define**, no se evade.
- **Un solo constructo: `type`. Prohibido `interface`** (salvo *declaration merging* de librerías, que casi no ocurre).
- **Todo `.lean()` se tipa:** `.lean<TipoLean>()`. Nunca `.lean()` pelón + casts.
- **`Model.find/aggregate`** se tipan (`aggregate<T>()`, `FilterQuery<Doc>` para filtros).
- Types en **PascalCase**; funciones/variables en **camelCase**.

## 2. Organización de types (una sola fuente por forma)
Para que no re-tipemos algo que ya existe:
- **Regla de hogar:**
  - Lo usa **1 dominio** → `modules/<dominio>/types/<dominio>.types.ts`.
Lo usan **2+ dominios** (transversal) → `server/src/shared/`. **Prohibido crear cosas nuevas en `server/src/interfaces/`** (carpeta legacy a eliminar cuando se solicite).
  - *Prueba:* "si lo pongo en el dominio A, ¿B tendría que meter la mano a la carpeta de A para usarlo?" Sí → es transversal → `shared/`.
- **Nunca types inline** en firmas si son no triviales (>3-4 campos) o se reutilizan. Van al archivo de types del dominio.
- **Sufijos consistentes y grepeables:** `*Lean` (forma BD), `*Dto` (salida), `*Input` (entrada), `*Filter`/`*Scope` (auxiliares).
- **Buscar antes de definir:** antes de crear un type, `grep` por la forma/sufijo para ver si ya existe.
- Un **índice type-only por dominio** (`types/index.ts` que solo re-exporta) sirve de catálogo.

## 3. Input ≠ Output ≠ Persistido
- El type de **entrada** (caller/SDL), el de **salida** (DTO: `id` string, fechas ISO) y el **lean/persistido** (`_id: ObjectId`, `Date`) son **distintos**. No igualar el retorno de un mapper al lean.
- Los **mappers transforman** entre esas formas; ese es su trabajo.
- Comparte un type **solo por igualdad genuina**, no por parecido coincidental (compartir por "casi iguales" acopla dominios y rompe uno al cambiar el otro).

## 4. Dónde va cada cosa
- **Types** → `modules/<dominio>/types/` o `server/src/shared/` (ver §2).
- **Listas de valores compartidas** (constante + su type derivado, ej. `CONVENIO_BASES` / `ConvenioBaseKey`) → `server/src/shared/`. Una sola fuente: los `enum` de los schemas y los types se derivan de ahí.
- **Funciones puras / mappers** (transforman datos en memoria, testeables sin BD) → `modules/<dominio>/mappers/`.
- **Errores** (clases, códigos y mensajes al usuario) → `server/src/errors/`: un archivo por dominio (`<Dominio>Errores.ts`, ej. `ConvenioErrores.ts`) + los genéricos (`ValidationError`, `ForbiddenError`, …). **Nunca** en resolvers ni en services.- **Modelos Mongoose** → `modules/<dominio>/models/`.
- **Acceso a datos (async, toca BD)** → el **service** del módulo (`modules/<dominio>/<x>Service.ts`).
- **Helpers genéricos** → `utils/` (`toTrimmed` en `utils/normalize.ts`, `round2` en `utils/money.ts`).
- **Helpers compartidos entre resolvers** → `graphql/resolvers/_shared.ts`.

## 5. Dirección de dependencias (capas, no cadena)
```
resolver (graphql)  →  service/module (lógica)  →  model (Mongoose, lo más interno)
```
- Permitido: **resolver → module**, **module → module**, **module → model**.
- Prohibido: **module → graphql** (un service NO importa de `graphql/`). Nada interno importa de lo externo.
- `module → module` es el punto laxo → **cuidar ciclos** (lo transversal a `utils/`/`shared/`; `import/no-cycle` en lint).

## 6. Reutilización (funciones y módulos, NO clases)
- El primitivo de reutilización aquí es la **función pura + el módulo + el type**, no la clase.
- **Clases solo para:** errores tipados (`CierreError`) y casos genuinamente con estado (raros). Reusar con OOP donde una función basta va contra el grano del repo.
- Si un patrón (o **parte** de una función) se repite 2-3 veces → **extraer** a su lugar correcto y reusar.
- No duplicar mappers ni lógica entre resolver y service: una sola función compartida.
- Dedup: **textual** la caza `jscpd`; **semántica** (misma lógica, otro nombre) la caza el Revisor.

## 7. Resolvers delgados
- Un resolver: **auth → normaliza args → autoriza → delega al service**. Nada de queries crudas ni shaping en el resolver.
- El **SDL ya valida los args**: para no-nulos (`ID!`, `String!`, `Float`) **no** revalidar con `typeof`. Solo validar reglas de negocio que el SDL no cubre (ej. monto ≥ 0).

## 8. Funciones legibles (nada de monstruos)
- Una función = **una responsabilidad a un nivel**. El orquestador **coordina** (se lee como índice); las piezas (fetch → service, shape → mapper, cálculo puro → su función) se extraen y nombran.
- Extraer cálculos de negocio puros (ej. `calcularCierre`) fuera de funciones de I/O, para testearlos sin BD.
- **Disparadores para extraer un mapper:** la función retorna un object literal grande (>8-10 campos); tiene `.map/.filter/.sort` con lógica inline; mezcla fetch + shape + cálculo.
- Umbrales (enforce con ESLint): `max-lines-per-function` ~50-60, `complexity` ~10, `max-depth` ~3-4, `max-params` ~4 (más params → un objeto tipado).

## 9. Manejo de errores
- Los errores de dominio son **clases en `server/src/errors/` que extienden `DomainError`** (`errors/DomainError.ts`): código GraphQL (`BAD_USER_INPUT`, `FORBIDDEN`, …) + **mensaje seguro** + código de dominio en `extensions` (ej. `ConvenioError` con `convenioCode`, `CierreError` con `cierreCode`). Cada código de dominio tiene su texto en un `Record<Codigo, string>` junto a la clase.
- **La traducción es central:** `formatError` (`graphql/createApolloServer.ts`) convierte cualquier `DomainError` en la respuesta al cliente. **El resolver NO traduce errores de dominio:** nada de `try/catch` para convertirlos, ni `new GraphQLError`, ni mapas de mensajes en el resolver. El service lanza, el error sube solo.
- **Services:** nunca `throw new Error('INVALID')` con strings sueltos ni `new GraphQLError` (eso es de `graphql/`). Lanzan su `DomainError`.
- **Culpa del usuario → 4xx** (su `DomainError`). **Fallo nuestro** (la BD no devolvió el documento, dato corrupto, excepción de librería) → **no se envuelve** en un error de usuario: se deja subir y sale como 500.
- **Mensaje seguro al cliente + detalle en logs (server-side).** No filtrar internals (stack, ids internos, tablas, queries) en la respuesta de la API.
- Solo se atrapa un error en un service/resolver para **convertir un error de librería en uno de dominio** (ej. duplicado de Mongo `11000` → `ConvenioError('DUPLICATE_ACTIVE')`), y lo demás se relanza tal cual. **Nunca `if (err instanceof Error)`** (atrapa todo y enmascara los 500 reales).

## 10. Comentarios (para que un humano lo lea rápido)
- **Arriba de cada archivo:** un comentario de **qué se encarga el file** (por archivo, no por función).
- **Arriba de cada mapper/función/schema/type:** **una línea sencilla** de qué es / qué hace.
- La línea debe **agregar valor** (intención/por qué), **no parafrasear el nombre**. `// suma dos números` sobre `sumar(a,b)` es ruido.

## 11. Nombres
- **Descriptivos, sin abreviaturas crípticas** (`cvKey`/`qty` → `convenioKey`/`cantidad`).
- Claridad sobre brevedad, pero **sin ensayos** (`id`, `db` ok; `convenioKeysDelCobradorEnScope` es demasiado).
- Código en inglés (el repo ya lo está); nombres específicos y completos.

## 12. Concurrencia y correctness
- Awaits **independientes** → `Promise.all`.
- Leer-modificar-escribir → operación **atómica** (`findOneAndUpdate({ new: true })`) sobre update + read separado.
- Agregaciones: `$ifNull` en sumas (un `null` envenena `$sum`); verificar que campos/valores/enum del filtro **existan en el modelo real**.

## 13. Verificación (obligatoria antes de "terminado")
- `cd server && npx tsc --noEmit` → **limpio** (0 errores).
- Correr tests del área tocada; funciones puras (mappers, cálculos) deben tener tests.
- **Prohibido hardcodear para que un test pase.** Un test verifica lo que el código fuente hace de verdad. Prohibido: (1) ramas o valores especiales para tests en producción (`if (NODE_ENV === 'test')`, ids o fechas mágicas); (2) mockear la pieza bajo prueba; (3) sembrar datos en estados que la app real no produce (ej. un crédito `Activo` con `closedAt`); (4) ajustar el valor esperado a lo que salió. El esperado sale de la **regla de negocio**, no de correr el código. Si un test falla, se corrige el código o se **reporta**; el test no se acomoda.
- Sin imports muertos (`TS6133`).
- Enforce mecánico: ESLint (`no-explicit-any`, `naming-convention`, `no-floating-promises`, `import/no-cycle`, límites de tamaño) + `jscpd` (copy-paste).

## 14. Seguridad
- Identidad del actor (`capturadoPor`, etc.) sale del **auth server-side**, nunca del cliente.
- Nunca acceder al `.env` real; solo `.env.example`.

## 15. PIPELINEs
 **Piezas de aggregate** (stages, expresiones `$expr`, `$lookup`, filtros `$match`, orden y paginación de un `aggregate`) → `modules/<dominio>/<x>Pipeline.ts` (ej. `creditoOperacionPipeline.ts`). Son datos/constructores puros (testeables sin BD), pero **no** son mappers: un mapper convierte filas ya leídas; un pipeline describe **cómo leerlas**. Las expresiones internas que solo usa ese pipeline quedan privadas (sin `export`). Un pipeline que el service extenderá (ej. agregando su propio `$project`) **no** termina en proyección.