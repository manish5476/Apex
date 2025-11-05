// src/config/swaggerConfig.js
const swaggerJSDoc = require('swagger-jsdoc');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Apex CRM API',
    version: '1.0.0',
    description: 'API documentation for the Apex Multi-Tenant, Multi-Branch CRM',
    contact: {
      name: 'API Support',
      email: 'support@apex.com',
    },
  },
  servers: [
    {
      url: `http://localhost:${process.env.PORT || 4000}/api/v1`,
      description: 'Development server (local)',
    },
    {
      url: 'https://your-production-api-url.com/api/v1',
      description: 'Production server',
    },
  ],
  // This part is for defining security, like your JWT token
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token in the format: Bearer <token>',
      },
    },
  },
  // This makes sure the "Authorize" button uses your security scheme
  security: [
    {
      bearerAuth: [],
    },
  ],
};

const options = {
  swaggerDefinition,
  // This tells swagger-jsdoc to look for comments in these files
  apis: [
    './src/routes/v1/*.js', // All your V1 route files
    './src/models/*.js',    // We can define our schemas in the models
  ],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;