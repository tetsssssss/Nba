"""Modelo GLB low-poly inicial do NBA Universe Manager (Blender 3.6+/4.x).

No Blender: Scripting -> Open -> Run Script.
CLI: blender --background --python tools/blender/create-broadcast-player.py
Gera assets/models/nba-player.glb. Não altera saves ou código JS.
O protótipo não contém armature nem animações: é uma referência de escala.
"""
import os
import bpy

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

root = bpy.data.objects.new('PlayerRoot', None)
bpy.context.collection.objects.link(root)


def material(name, rgb):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
        bsdf.inputs['Roughness'].default_value = 0.85
    return m


jersey = material('Uniforme generico editavel', (0.06, 0.24, 0.68))
skin = material('Pele neutra', (0.54, 0.30, 0.20))
shorts = material('Short', (0.05, 0.13, 0.37))
shoe = material('Tenis', (0.86, 0.87, 0.91))


def body_part(name, shape, loc, scale, mat):
    if shape == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, location=loc)
    else:
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=1, depth=2, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    obj.parent = root
    return obj


body_part('Torso', 'cylinder', (0, 0, 3.65), (.7, .52, 1.12), jersey)
body_part('Cabeca', 'sphere', (0, 0, 5.42), (.55, .50, .57), skin)
body_part('Short', 'cylinder', (0, 0, 2.53), (.69, .55, .45), shorts)
for sign in [-1, 1]:
    body_part(f'Braco {sign}', 'cylinder', (sign * .94, 0, 3.47), (.22, .22, .94), skin)
    body_part(f'Perna {sign}', 'cylinder', (sign * .38, 0, 1.38), (.27, .30, 1.20), skin)
    body_part(f'Tenis {sign}', 'sphere', (sign * .38, -.24, .27), (.34, .61, .29), shoe)

# Seleção: raiz e componentes são exportados como hierarquia glTF.
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj == root or obj.parent == root:
        obj.select_set(True)
bpy.context.view_layer.objects.active = root
project = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
out = os.path.join(project, 'assets', 'models', 'nba-player.glb')
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True)
print('Modelo inicial exportado:', out)
