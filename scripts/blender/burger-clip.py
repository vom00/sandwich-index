"""
Builds the landing page's two models with their clips: the burger coming apart
and closing again (`burger-open`), and the straw lifting out of the soda's lid
and dropping back in (`soda-straw`). docs/plans/blender-clips.md has the plan.

    blender -b --factory-startup -P scripts/blender/burger-clip.py
    blender -b --factory-startup -P scripts/blender/burger-clip.py -- --out <dir>

Reads the Kenney sources in scripts/blender/source (Food Kit, CC0) and the
keys in scripts/blender/clips.json; writes public/landing/burger.glb and
soda.glb unless --out says otherwise. For each model it:

  1. removes the parts the page never shows (cheese, tomato);
  2. drops materials, UVs and normals: the page paints every part itself and
     computes its own normals, so the texture is never fetched;
  3. splits the soda's straw into its own node;
  4. adds an empty for each part the page builds in code (the mayo), so the
     clip can carry its track;
  5. keys each moving part's location and rotation, linear, one key per entry
     in clips.json, with no sampling: only the authored keys are written.

Lifts in clips.json are in the landing scene's units. The page scales each
model (world.ts: the bun's width to 0.64, the soda's height to 0.62), so the
script measures the same thing and divides by that scale: the file stays in
the model's own units and looks right in Blender.

Prints each file's size and exits non-zero if one is over its budget.
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))


def arg(name, default):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return argv[argv.index(name) + 1] if name in argv else default


def world_extent(ob, axis):
    index = "xyz".index(axis)
    values = [(ob.matrix_world @ v.co)[index] for v in ob.data.vertices]
    return max(values) - min(values)


def split_straw(spec):
    """Moves the straw (the thin parts above the lid) into an object of its own."""
    source = bpy.data.objects[spec["from"]]
    bpy.context.view_layer.objects.active = source
    source.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    # The import leaves the whole mesh selected.
    bpy.ops.mesh.select_all(action="DESELECT")
    bm = bmesh.from_edit_mesh(source.data)
    seen = set()
    picked = 0
    for start in bm.verts:
        if start.index in seen:
            continue
        part, stack = [], [start]
        seen.add(start.index)
        while stack:
            vert = stack.pop()
            part.append(vert)
            for edge in vert.link_edges:
                other = edge.other_vert(vert)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        thin = all(max(abs(v.co.x), abs(v.co.y)) <= spec["maxRadius"] for v in part)
        high = min(v.co.z for v in part) >= spec["minHeight"]
        if thin and high:
            for v in part:
                v.select = True
            picked += len(part)
    bm.select_flush(True)
    bmesh.update_edit_mesh(source.data)
    if picked == 0:
        raise SystemExit(f"no straw found in {spec['from']}")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    straw = next(ob for ob in bpy.context.selected_objects if ob is not source)
    straw.name = spec["name"]
    straw.data.name = spec["name"]
    print(f"  split {picked} vertices into '{straw.name}'")


def strip(ob):
    if ob.type != "MESH":
        return
    ob.data.materials.clear()
    while ob.data.uv_layers:
        ob.data.uv_layers.remove(ob.data.uv_layers[0])


def key_parts(model, fps, unit):
    action = bpy.data.actions.new(model["clip"])
    for name, keys in model["parts"].items():
        ob = bpy.data.objects[name]
        ob.rotation_mode = "QUATERNION"
        rest_location = ob.location.copy()
        rest_rotation = ob.rotation_quaternion.copy()
        ob.animation_data_create()
        ob.animation_data.action = action
        for frame, lift, tilt_x, tilt_z in keys:
            ob.location = rest_location.copy()
            ob.location.z += lift / unit
            # three's Z axis is Blender's -Y once the exporter turns +Z up into +Y up.
            tilt = Euler((math.radians(tilt_x), -math.radians(tilt_z), 0.0)).to_quaternion()
            ob.rotation_quaternion = rest_rotation @ tilt
            ob.keyframe_insert("location", frame=frame)
            ob.keyframe_insert("rotation_quaternion", frame=frame)
        ob.location = rest_location
        ob.rotation_quaternion = rest_rotation
    # Linear between keys, so the file holds the keys and nothing else (a
    # Bezier key is exported as a cubic spline, three values per key).
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = "LINEAR"
    return action


def build(model, config, src_dir, out_dir):
    print(f"{model['source']}:")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    scene = bpy.context.scene
    scene.render.fps = config["fps"]
    scene.frame_start = 0
    scene.frame_end = config["frames"]
    bpy.ops.import_scene.gltf(filepath=os.path.join(src_dir, model["source"]))

    unit_spec = model["unit"]
    unit = unit_spec["size"] / world_extent(bpy.data.objects[unit_spec["of"]], unit_spec["axis"])
    print(f"  scene units per model unit: {unit:.4f}")

    for name in model["remove"]:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    if "split" in model:
        split_straw(model["split"])
    for ob in list(bpy.data.objects):
        strip(ob)
    root = next((ob for ob in bpy.data.objects if ob.parent is None and ob.type == "EMPTY"), None)
    for name in model["empties"]:
        empty = bpy.data.objects.new(name, None)
        scene.collection.objects.link(empty)
        empty.parent = root

    key_parts(model, config["fps"], unit)
    scene.frame_set(0)

    out = os.path.join(out_dir, model["source"])
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_yup=True,
        export_materials="NONE",
        export_texcoords=False,
        export_normals=False,
        export_vertex_color="NONE",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=False,
        export_optimize_animation_size=True,
    )
    size = os.path.getsize(out)
    over = size > model["maxBytes"]
    print(f"  wrote {out}: {size} bytes (budget {model['maxBytes']}){'  OVER BUDGET' if over else ''}")
    return not over


def main():
    keys = arg("--keys", os.path.join(HERE, "clips.json"))
    src_dir = arg("--src", os.path.join(HERE, "source"))
    out_dir = arg("--out", os.path.join(ROOT, "public", "landing"))
    with open(keys, encoding="utf-8") as handle:
        config = json.load(handle)
    os.makedirs(out_dir, exist_ok=True)
    ok = all([build(model, config, src_dir, out_dir) for model in config["models"]])
    sys.exit(0 if ok else 1)


main()
