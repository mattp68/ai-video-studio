"""Build a tiny authored 3D fixture. This file runs inside Blender.

scripts/blender_render.py runs a scene script like this one, then sets the output
format and renders it. A scene script only builds the scene: objects, materials,
lights, camera, resolution, frame rate and frame range. It never renders or writes
files itself.
"""
import bpy
from mathutils import Vector


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE"
except TypeError:  # Blender 4.2 to 4.5 name the same engine BLENDER_EEVEE_NEXT.
    scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 320
scene.render.resolution_y = 320
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = 12
scene.world = bpy.data.worlds.new("Slate background")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.03, 0.05, 1)

bpy.ops.mesh.primitive_cube_add(size=2)
cube = bpy.context.object
bevel = cube.modifiers.new("Edge highlights", "BEVEL")
bevel.width = 0.14
bevel.segments = 4
material = bpy.data.materials.new("Lime")
material.use_nodes = True
material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.45, 0.7, 0.03, 1)
cube.data.materials.append(material)
for frame, angle in ((1, 0.15), (12, 1.35)):
    cube.rotation_euler = (0.17, 0.08, angle)
    cube.keyframe_insert(data_path="rotation_euler", frame=frame)

bpy.ops.object.light_add(type="AREA", location=(2, -4, 5))
light = bpy.context.object
light.data.energy = 550
light.data.size = 3
point_at(light, (0, 0, 0))

bpy.ops.object.camera_add(location=(3.3, -5, 3.1))
scene.camera = bpy.context.object
point_at(scene.camera, (0, 0, 0))
