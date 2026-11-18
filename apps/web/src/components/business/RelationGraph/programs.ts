/**
 * Sigma.js WebGL programs for RelationGraph (graph-viz AC-6..AC-8, AC-18).
 *
 * - `GraphNodeProgram`: a disc with a coloured ring (主类型), optional dotted ring (推测),
 *   optional glow (星空), and its own opacity; radius in graph units, so it scales with the
 *   camera like the positions do (the layout guarantees nodes never overlap).
 * - `GraphEdgeProgram`: one program for every line — straight (我 → 他) or bent outwards
 *   away from 我 (第三方之间), width given separately at each end (感受不对称 → taper),
 *   dash pattern in pixels (转述 6/5, 推测 1.5/4), optional glow, its own opacity. Widths stay
 *   in screen pixels whatever the zoom, as in the prototype.
 *
 * Both work in screen pixels: positions go through Sigma's matrix to clip space, offsets
 * are pixels / resolution. Colours are premultiplied for Sigma's ONE / ONE_MINUS_SRC_ALPHA.
 */
import { EdgeProgram, NodeProgram, type ProgramInfo } from "sigma/rendering";
import type { EdgeDisplayData, NodeDisplayData, RenderParams } from "sigma/types";
import { floatColor } from "sigma/utils";
import { tokens } from "../../../tokens.gen.ts";

const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext;

/** Extra display data the reducers hand to these programs. */
export type GraphNodeDisplay = NodeDisplayData & {
  fillColor: string;
  /** Ring width in px. */
  strokeWidth: number;
  /** Glow reach in px (0 = none). */
  glow: number;
  dashed: boolean;
  alpha: number;
};

export type GraphEdgeDisplay = EdgeDisplayData & {
  /** Full widths in px at the source end and the target end. */
  widthSource: number;
  widthTarget: number;
  dash: number[];
  /** 0 = straight; > 0 = bent away from the centre by this share of the chord. */
  curve: number;
  alpha: number;
  glow: number;
};

const NODE_VERTEX = /* glsl */ `
attribute vec2 a_position;
attribute float a_size;
attribute vec4 a_fill;
attribute vec4 a_stroke;
attribute vec4 a_params;
attribute vec4 a_id;
attribute vec2 a_corner;

uniform mat3 u_matrix;
uniform vec2 u_resolution;
uniform float u_scale;

varying vec4 v_fill;
varying vec4 v_stroke;
varying vec2 v_local;
varying float v_radius;
varying float v_strokeWidth;
varying float v_glow;
varying float v_dashed;
varying float v_alpha;

const float bias = 255.0 / 254.0;

void main() {
  float radius = a_size * u_scale;
  float reach = radius + a_params.y + 2.0;
  vec2 center = (u_matrix * vec3(a_position, 1.0)).xy;
  vec2 offset = a_corner * reach;
  gl_Position = vec4(center + offset * 2.0 / u_resolution, 0.0, 1.0);
  v_local = offset;
  v_radius = radius;
  v_strokeWidth = a_params.x;
  v_glow = a_params.y;
  v_dashed = a_params.z;
  v_alpha = a_params.w;
  #ifdef PICKING_MODE
  v_fill = a_id;
  v_fill.a *= bias;
  #else
  v_fill = a_fill;
  #endif
  v_stroke = a_stroke;
}
`;

const NODE_FRAGMENT = /* glsl */ `
precision highp float;

varying vec4 v_fill;
varying vec4 v_stroke;
varying vec2 v_local;
varying float v_radius;
varying float v_strokeWidth;
varying float v_glow;
varying float v_dashed;
varying float v_alpha;

void main(void) {
  float d = length(v_local);
  #ifdef PICKING_MODE
  if (d > v_radius + 3.0) discard;
  gl_FragColor = v_fill;
  #else
  vec4 color = vec4(0.0);
  float inner = v_radius - v_strokeWidth;
  if (d <= v_radius + 1.0) {
    float t = smoothstep(inner - 0.5, inner + 0.5, d);
    vec4 ring = v_stroke;
    if (v_dashed > 0.5) {
      float along = (atan(v_local.y, v_local.x) + 3.14159265) * v_radius;
      if (mod(along, 5.0) > 2.0) ring = v_fill;
    }
    vec4 base = mix(v_fill, ring, t);
    float edge = 1.0 - smoothstep(v_radius - 0.5, v_radius + 0.5, d);
    color = vec4(base.rgb, base.a * edge);
  }
  if (v_glow > 0.0 && d > v_radius - 1.0) {
    float g = 1.0 - smoothstep(v_radius, v_radius + v_glow, d);
    float ga = g * g * 0.6 * v_stroke.a;
    color = vec4(mix(v_stroke.rgb, color.rgb, color.a), color.a + ga * (1.0 - color.a));
  }
  float a = color.a * v_alpha;
  gl_FragColor = vec4(color.rgb * a, a);
  #endif
}
`;

const NODE_UNIFORMS = ["u_matrix", "u_resolution", "u_scale"] as const;

export class GraphNodeProgram extends NodeProgram<(typeof NODE_UNIFORMS)[number]> {
  getDefinition() {
    return {
      VERTICES: 6,
      VERTEX_SHADER_SOURCE: NODE_VERTEX,
      FRAGMENT_SHADER_SOURCE: NODE_FRAGMENT,
      METHOD: WebGLRenderingContext.TRIANGLES,
      UNIFORMS: NODE_UNIFORMS,
      ATTRIBUTES: [
        { name: "a_position", size: 2, type: FLOAT },
        { name: "a_size", size: 1, type: FLOAT },
        { name: "a_fill", size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: "a_stroke", size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: "a_params", size: 4, type: FLOAT },
        { name: "a_id", size: 4, type: UNSIGNED_BYTE, normalized: true },
      ],
      CONSTANT_ATTRIBUTES: [{ name: "a_corner", size: 2, type: FLOAT }],
      CONSTANT_DATA: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, -1],
        [1, 1],
        [-1, 1],
      ],
    };
  }

  processVisibleItem(nodeIndex: number, startIndex: number, data: NodeDisplayData) {
    const d = data as GraphNodeDisplay;
    const a = this.array;
    let i = startIndex;
    a[i++] = d.x;
    a[i++] = d.y;
    a[i++] = d.size;
    a[i++] = floatColor(d.fillColor ?? tokens.color["neutral-bg-container"]);
    a[i++] = floatColor(d.color);
    a[i++] = d.strokeWidth ?? 2;
    a[i++] = d.glow ?? 0;
    a[i++] = d.dashed ? 1 : 0;
    a[i++] = d.alpha ?? 1;
    a[i++] = nodeIndex;
  }

  setUniforms(params: RenderParams, { gl, uniformLocations }: ProgramInfo) {
    gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
    gl.uniform2f(uniformLocations.u_resolution, params.width, params.height);
    gl.uniform1f(uniformLocations.u_scale, this.renderer.getGraphToViewportRatio());
  }
}

/** Segments per line: enough for a smooth outward bend. */
const SEGMENTS = 16;

const EDGE_VERTEX = /* glsl */ `
attribute vec2 a_source;
attribute vec2 a_target;
attribute vec2 a_widths;
attribute vec2 a_dash;
attribute vec3 a_shape;
attribute vec4 a_color;
attribute vec4 a_id;
attribute vec2 a_vertex;

uniform mat3 u_matrix;
uniform vec2 u_resolution;
uniform vec2 u_center;

varying vec4 v_color;
varying float v_dist;
varying float v_halfWidth;
varying float v_along;
varying vec2 v_dash;
varying float v_alpha;
varying float v_glow;

const float bias = 255.0 / 254.0;

vec2 toPixels(vec2 p) {
  vec2 c = (u_matrix * vec3(p, 1.0)).xy;
  return vec2((c.x + 1.0) * 0.5 * u_resolution.x, (1.0 - c.y) * 0.5 * u_resolution.y);
}

void main() {
  float curve = a_shape.x;
  float glow = a_shape.y;
  vec2 s = toPixels(a_source);
  vec2 e = toPixels(a_target);
  vec2 m = (s + e) * 0.5;
  vec2 q = m + (m - u_center) * curve;
  float t = a_vertex.x;
  float side = a_vertex.y;
  vec2 p = (1.0 - t) * (1.0 - t) * s + 2.0 * (1.0 - t) * t * q + t * t * e;
  vec2 d = 2.0 * (1.0 - t) * (q - s) + 2.0 * t * (e - q);
  if (length(d) < 0.0001) d = e - s + vec2(0.0001, 0.0);
  vec2 n = normalize(vec2(-d.y, d.x));
  float halfWidth = max(mix(a_widths.x, a_widths.y, t) * 0.5, 0.5);
  float reach = halfWidth + glow + 1.0;
  vec2 pos = p + n * side * reach;
  gl_Position = vec4(pos.x / u_resolution.x * 2.0 - 1.0, 1.0 - pos.y / u_resolution.y * 2.0, 0.0, 1.0);
  v_dist = side * reach;
  v_halfWidth = halfWidth;
  float len = 0.5 * (length(e - s) + length(q - s) + length(e - q));
  v_along = t * len;
  v_dash = a_dash;
  v_glow = glow;
  #ifdef PICKING_MODE
  v_color = a_id;
  v_alpha = 1.0;
  #else
  v_color = a_color;
  v_alpha = a_shape.z;
  #endif
  v_color.a *= bias;
}
`;

const EDGE_FRAGMENT = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying float v_dist;
varying float v_halfWidth;
varying float v_along;
varying vec2 v_dash;
varying float v_alpha;
varying float v_glow;

void main(void) {
  if (v_dash.x > 0.0 && mod(v_along, v_dash.x + v_dash.y) > v_dash.x) discard;
  float d = abs(v_dist);
  #ifdef PICKING_MODE
  if (d > v_halfWidth + 1.0) discard;
  gl_FragColor = v_color;
  #else
  float a = 1.0 - smoothstep(v_halfWidth - 0.5, v_halfWidth + 0.5, d);
  if (v_glow > 0.0) {
    float g = 1.0 - smoothstep(v_halfWidth, v_halfWidth + v_glow, d);
    a = max(a, g * g * 0.45);
  }
  a *= min(v_color.a, 1.0) * v_alpha;
  gl_FragColor = vec4(v_color.rgb * a, a);
  #endif
}
`;

const EDGE_UNIFORMS = ["u_matrix", "u_resolution", "u_center"] as const;

function edgeVertices(): number[][] {
  const out: number[][] = [];
  for (let k = 0; k < SEGMENTS; k++) {
    const t0 = k / SEGMENTS;
    const t1 = (k + 1) / SEGMENTS;
    out.push([t0, 1], [t0, -1], [t1, 1], [t1, 1], [t0, -1], [t1, -1]);
  }
  return out;
}

/** Where 我 (the layout's origin) is on screen, for bending lines away from it. */
export type CenterLocator = () => { x: number; y: number };

export function createGraphEdgeProgram(center: CenterLocator) {
  return class GraphEdgeProgram extends EdgeProgram<(typeof EDGE_UNIFORMS)[number]> {
    getDefinition() {
      return {
        VERTICES: SEGMENTS * 6,
        VERTEX_SHADER_SOURCE: EDGE_VERTEX,
        FRAGMENT_SHADER_SOURCE: EDGE_FRAGMENT,
        METHOD: WebGLRenderingContext.TRIANGLES,
        UNIFORMS: EDGE_UNIFORMS,
        ATTRIBUTES: [
          { name: "a_source", size: 2, type: FLOAT },
          { name: "a_target", size: 2, type: FLOAT },
          { name: "a_widths", size: 2, type: FLOAT },
          { name: "a_dash", size: 2, type: FLOAT },
          { name: "a_shape", size: 3, type: FLOAT },
          { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
          { name: "a_id", size: 4, type: UNSIGNED_BYTE, normalized: true },
        ],
        CONSTANT_ATTRIBUTES: [{ name: "a_vertex", size: 2, type: FLOAT }],
        CONSTANT_DATA: edgeVertices(),
      };
    }

    processVisibleItem(
      edgeIndex: number,
      startIndex: number,
      source: NodeDisplayData,
      target: NodeDisplayData,
      data: EdgeDisplayData,
    ) {
      const d = data as GraphEdgeDisplay;
      const a = this.array;
      let i = startIndex;
      a[i++] = source.x;
      a[i++] = source.y;
      a[i++] = target.x;
      a[i++] = target.y;
      a[i++] = d.widthSource ?? d.size;
      a[i++] = d.widthTarget ?? d.size;
      a[i++] = d.dash?.[0] ?? 0;
      a[i++] = d.dash?.[1] ?? 0;
      a[i++] = d.curve ?? 0;
      a[i++] = d.glow ?? 0;
      a[i++] = d.alpha ?? 1;
      a[i++] = floatColor(d.color);
      a[i++] = edgeIndex;
    }

    setUniforms(params: RenderParams, { gl, uniformLocations }: ProgramInfo) {
      gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
      gl.uniform2f(uniformLocations.u_resolution, params.width, params.height);
      const c = center();
      gl.uniform2f(uniformLocations.u_center, c.x, c.y);
    }
  };
}
