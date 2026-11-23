import { MeshoptSimplifier } from 'meshoptimizer';
import { readFile, writeFile } from 'node:fs/promises';

const [input, output, targetArg] = process.argv.slice(2);
const targetTriangles = Number(targetArg);
if (!input || !output || !Number.isInteger(targetTriangles) || targetTriangles < 100) {
  throw new Error('Usage: node scripts/decimate-glb.mjs input.glb output.glb targetTriangles');
}
await MeshoptSimplifier.ready;
const source = await readFile(input);
const jsonLength = source.readUInt32LE(12);
const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString('utf8'));
const binLength = source.readUInt32LE(20 + jsonLength);
const bin = source.subarray(28 + jsonLength, 28 + jsonLength + binLength);

function accessorData(index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const bytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
  return { accessor, view, offset, components, bytes, stride: view.byteStride || components * bytes };
}
function readIndices(index) {
  const { accessor, offset, bytes, stride } = accessorData(index);
  const result = new Uint32Array(accessor.count);
  for (let i = 0; i < result.length; i += 1) result[i] = bytes === 1 ? bin.readUInt8(offset + i * stride) : bytes === 2 ? bin.readUInt16LE(offset + i * stride) : bin.readUInt32LE(offset + i * stride);
  return result;
}
function readPositions(index) {
  const { accessor, offset, stride } = accessorData(index);
  const result = new Float32Array(accessor.count * 3);
  for (let i = 0; i < accessor.count; i += 1) for (let axis = 0; axis < 3; axis += 1) result[i * 3 + axis] = bin.readFloatLE(offset + i * stride + axis * 4);
  return result;
}
function readFloatAttribute(index) {
  const { accessor, offset, stride, components } = accessorData(index);
  const result = new Float32Array(accessor.count * components);
  for (let i = 0; i < accessor.count; i += 1) for (let axis = 0; axis < components; axis += 1) result[i * components + axis] = bin.readFloatLE(offset + i * stride + axis * 4);
  return result;
}
const primitives = (json.meshes || []).flatMap((mesh) => mesh.primitives);
const originalTriangles = primitives.map((primitive) => primitive.indices !== undefined ? json.accessors[primitive.indices].count / 3 : json.accessors[primitive.attributes.POSITION].count / 3);
const totalOriginal = originalTriangles.reduce((sum, value) => sum + value, 0);
const removedAccessors = new Set();
const appendedViews = new Map();
for (const [primitiveIndex, primitive] of primitives.entries()) {
  if (primitive.indices === undefined) continue;
  const indices = readIndices(primitive.indices);
  const positions = readPositions(primitive.attributes.POSITION);
  const proportionalTarget = Math.max(300, Math.floor(targetTriangles * originalTriangles[primitiveIndex] / Math.max(1, totalOriginal)) * 3);
  const targetIndices = Math.min(indices.length, proportionalTarget);
  const normals = primitive.attributes.NORMAL !== undefined ? readFloatAttribute(primitive.attributes.NORMAL) : null;
  const uvs = primitive.attributes.TEXCOORD_0 !== undefined ? readFloatAttribute(primitive.attributes.TEXCOORD_0) : null;
  const attributeStride = normals && uvs ? 5 : 0;
  const attributes = new Float32Array((positions.length / 3) * attributeStride);
  if (attributeStride) {
    for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) attributes[vertex * 5 + axis] = normals[vertex * 3 + axis];
      attributes[vertex * 5 + 3] = uvs[vertex * 2];
      attributes[vertex * 5 + 4] = uvs[vertex * 2 + 1];
    }
  }
  const [simplified, error] = attributeStride
    ? MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attributes, attributeStride, [0.35, 0.35, 0.35, 1.5, 1.5], null, targetIndices, 0.2, ['Permissive'])
    : MeshoptSimplifier.simplify(indices, positions, 3, targetIndices, 0.08, ['Permissive']);
  const used = [...new Set(simplified)].sort((a, b) => a - b);
  const vertexRemap = new Uint32Array(positions.length / 3);
  used.forEach((oldIndex, newIndex) => { vertexRemap[oldIndex] = newIndex; });
  const compactedIndices = Uint32Array.from(simplified, (oldIndex) => vertexRemap[oldIndex]);
  removedAccessors.add(primitive.indices);
  for (const [attribute, accessorIndex] of Object.entries(primitive.attributes)) {
    const sourceAttribute = readFloatAttribute(accessorIndex);
    const { accessor, components } = accessorData(accessorIndex);
    const compacted = new Float32Array(used.length * components);
    used.forEach((oldIndex, newIndex) => {
      for (let axis = 0; axis < components; axis += 1) compacted[newIndex * components + axis] = sourceAttribute[oldIndex * components + axis];
    });
    removedAccessors.add(accessorIndex);
    const bytes = Buffer.from(compacted.buffer, compacted.byteOffset, compacted.byteLength);
    const viewIndex = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: 0, byteLength: bytes.length, target: 34962 });
    appendedViews.set(viewIndex, bytes);
    const nextAccessor = { bufferView: viewIndex, componentType: 5126, count: used.length, type: accessor.type };
    if (attribute === 'POSITION') {
      nextAccessor.min = [Infinity, Infinity, Infinity];
      nextAccessor.max = [-Infinity, -Infinity, -Infinity];
      for (let vertex = 0; vertex < used.length; vertex += 1) for (let axis = 0; axis < 3; axis += 1) {
        nextAccessor.min[axis] = Math.min(nextAccessor.min[axis], compacted[vertex * 3 + axis]);
        nextAccessor.max[axis] = Math.max(nextAccessor.max[axis], compacted[vertex * 3 + axis]);
      }
    }
    json.accessors.push(nextAccessor);
    primitive.attributes[attribute] = json.accessors.length - 1;
  }
  const bytes = Buffer.from(compactedIndices.buffer, compactedIndices.byteOffset, compactedIndices.byteLength);
  const viewIndex = json.bufferViews.length;
  json.bufferViews.push({ buffer: 0, byteOffset: 0, byteLength: bytes.length, target: 34963 });
  appendedViews.set(viewIndex, bytes);
  json.accessors.push({ bufferView: viewIndex, componentType: 5125, count: compactedIndices.length, type: 'SCALAR' });
  primitive.indices = json.accessors.length - 1;
  console.log(`${input}: primitive ${primitiveIndex} ${indices.length / 3} -> ${compactedIndices.length / 3} triangles, ${positions.length / 3} -> ${used.length} vertices, error ${error.toFixed(5)}`);
}
const removed = [...removedAccessors].sort((a, b) => a - b);
const remapAccessor = (index) => index - removed.filter((value) => value < index).length;
json.accessors = json.accessors.filter((_, index) => !removedAccessors.has(index));
for (const mesh of json.meshes || []) {
  for (const primitive of mesh.primitives) {
    primitive.indices = primitive.indices !== undefined ? remapAccessor(primitive.indices) : undefined;
    for (const [key, value] of Object.entries(primitive.attributes)) primitive.attributes[key] = remapAccessor(value);
    for (const target of primitive.targets || []) for (const [key, value] of Object.entries(target)) target[key] = remapAccessor(value);
  }
}
for (const skin of json.skins || []) {
  if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = remapAccessor(skin.inverseBindMatrices);
}
const usedViews = new Set();
for (const accessor of json.accessors || []) if (accessor.bufferView !== undefined) usedViews.add(accessor.bufferView);
for (const image of json.images || []) if (image.bufferView !== undefined) usedViews.add(image.bufferView);
const viewMap = new Map();
const rebuiltViews = [];
const chunks = [];
let byteOffset = 0;
for (const [index, view] of (json.bufferViews || []).entries()) {
  if (!usedViews.has(index)) continue;
  const original = appendedViews.get(index) || bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
  const padding = (4 - byteOffset % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); byteOffset += padding; }
  viewMap.set(index, rebuiltViews.length);
  rebuiltViews.push({ ...view, byteOffset });
  chunks.push(original);
  byteOffset += original.length;
}
json.bufferViews = rebuiltViews;
for (const accessor of json.accessors || []) if (accessor.bufferView !== undefined) accessor.bufferView = viewMap.get(accessor.bufferView);
for (const image of json.images || []) if (image.bufferView !== undefined) image.bufferView = viewMap.get(image.bufferView);
const newBin = Buffer.concat(chunks);
json.buffers = [{ byteLength: newBin.length }];
const jsonBytes = Buffer.from(JSON.stringify(json));
const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 0x20)]);
const totalLength = 12 + 8 + paddedJson.length + 8 + newBin.length;
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(totalLength, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(paddedJson.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(newBin.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);
await writeFile(output, Buffer.concat([header, jsonHeader, paddedJson, binHeader, newBin]));
console.log(`${output}: ${totalOriginal} -> ${Math.min(totalOriginal, targetTriangles)} target triangles, ${source.length} -> ${totalLength} bytes`);
