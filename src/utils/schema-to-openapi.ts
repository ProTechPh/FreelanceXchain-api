import type { Schema, SchemaProperty } from '../middleware/validation-middleware.js';

/**
 * Convert a validation-middleware schema property into its OpenAPI 3.0 form.
 * Middleware-only keys (`required`, `requiredProperties`) are consumed here;
 * everything else maps 1:1 onto OpenAPI keywords.
 */
function convertProperty(prop: SchemaProperty): Record<string, unknown> {
  const openApi: Record<string, unknown> = {};

  if (prop.type !== undefined) openApi.type = prop.type;
  if (prop.pattern !== undefined) openApi.pattern = prop.pattern;
  if (prop.format !== undefined) openApi.format = prop.format;
  if (prop.minLength !== undefined) openApi.minLength = prop.minLength;
  if (prop.maxLength !== undefined) openApi.maxLength = prop.maxLength;
  if (prop.minimum !== undefined) openApi.minimum = prop.minimum;
  if (prop.maximum !== undefined) openApi.maximum = prop.maximum;
  if (prop.exclusiveMinimum !== undefined) openApi.exclusiveMinimum = prop.exclusiveMinimum;
  if (prop.exclusiveMaximum !== undefined) openApi.exclusiveMaximum = prop.exclusiveMaximum;
  if (prop.minItems !== undefined) openApi.minItems = prop.minItems;
  if (prop.maxItems !== undefined) openApi.maxItems = prop.maxItems;
  if (prop.enum !== undefined) openApi.enum = prop.enum;
  if (prop.items !== undefined) openApi.items = convertProperty(prop.items);

  if (prop.properties !== undefined) {
    openApi.properties = Object.fromEntries(
      Object.entries(prop.properties).map(([key, nested]) => [key, convertProperty(nested)]),
    );
  }

  // Nested-object required fields map onto the nested object's `required` array.
  if (prop.requiredProperties !== undefined && prop.requiredProperties.length > 0) {
    openApi.required = [...prop.requiredProperties];
  }

  return openApi;
}

/**
 * Convert a validation-middleware `Schema` (as used for request bodies) into an
 * OpenAPI 3.0 schema object. The middleware schema is the single source of
 * truth, so changing runtime validation without regenerating the spec shows up
 * as a mismatch in the drift test.
 */
export function validationSchemaToOpenApi(schema: Schema): Record<string, unknown> {
  const openApi: Record<string, unknown> = {};

  if (schema.type !== undefined) openApi.type = schema.type;
  if (schema.additionalProperties === false) openApi.additionalProperties = false;

  const requiredFields = [...(schema.required ?? [])];
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (prop.required === true && !requiredFields.includes(key)) {
      requiredFields.push(key);
    }
  }

  const properties: Record<string, unknown> = Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([key, prop]) => [key, convertProperty(prop)]),
  );

  // File-upload fields arrive via multer (`req.files`), not the JSON body, so
  // the middleware schema carries them as top-level `files` metadata rather
  // than a `properties` entry. Emit them as binary-array properties.
  if (schema.files) {
    const { fieldName, minItems, maxItems, description } = schema.files;
    properties[fieldName] = {
      type: 'array',
      items: { type: 'string', format: 'binary' },
      minItems,
      maxItems,
      description,
    };
    if (minItems >= 1 && !requiredFields.includes(fieldName)) {
      requiredFields.push(fieldName);
    }
  }

  if (requiredFields.length > 0) openApi.required = requiredFields;
  // Preserve the historical behavior of emitting `properties` even when it is
  // explicitly declared empty, and include the injected file-upload fields.
  if (schema.properties !== undefined || schema.files !== undefined) openApi.properties = properties;

  return openApi;
}
