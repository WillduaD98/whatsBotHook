// import express from 'express';
// import dotenv from 'dotenv';
// import path from 'path';
// import cors from 'cors';
// import helmet from 'helmet';
// import rateLimit from 'express-rate-limit';
// import depthLimit from 'graphql-depth-limit';
// import { GraphQLFormattedError } from 'graphql';
// import { ApolloServer } from 'apollo-server-express';



// dotenv.config();
// const isProd = process.env.NODE_ENV = process.env.NODE_ENV || 'development' ;

// //Accedemos a la IP real del cliente

// // const getClientIP = (reqd: any) => {
// //     return reqd.headers['x-forwarded-for'] || reqd.connection.remoteAddress;
// // }
// // //Definimos rateLimit

// // const server = new ApolloServer({
// //     typeDefs,
// //     resolvers,
// //     introspection: true,
// //     validationRules: [depthLimit(5)], //Evitamos querys complehas con limitacion de complejidad
// //     hideSchemaDetailsFromClientErrors: true,
// //     maxRecursiveSelections: 1000000,
// //     formarError: (formattedError: GraphQLFormattedError) => {
// //         return {
// //             message: formattedError.message,
// //             path: formattedError.path || [],
// //             code: (formattedError.extensions as any)?.code || 'INTERNAL_SERVER_ERROR'
// //         };
// //     }
// // });
