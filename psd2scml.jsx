#target photoshop

#include "JSON-js/json.js"

function round(number, digits)
{
	var multiple = Math.pow(10, digits);
	return Math.round(number * multiple) / multiple;
};

function r2d(r)
{
	return r * 180 / Math.PI;
}

function main()
{
	if (!documents.length) return;

	var doc = app.activeDocument;

	var out_path = doc.path;// + "/" + doc.name.replace(".psd", "");
	var out_folder = new Folder(out_path);
	if (!out_folder.exists) { out_folder.create(); }

	var folders = [];
	var root_bone = null;
	var objects = [];

	/* scope */ ;(function () // generate folders
	{
		var folder_id = 0;

		var parseFolder = function (parent_group, folder_name)
		{
			var path_name = ((folder_name.length > 0)?(folder_name + "/"):(""));

			for (var group_i = 0, group_ct = parent_group.layerSets.length; group_i < group_ct; ++group_i)
			{
				var group = parent_group.layerSets[group_i];
				var group_base_name = group.name.match(/\w+/g)[0]; // extract first word from group name
				if (group.visible)
				{
					parseFolder(group, path_name + group_base_name);
				}
			}

			var folder = {};
			folder.id = folder_id;
			folder.name = folder_name;
			folder.group_name = parent_group.name;
			folder.files = [];

			var file_id = 0;
			for (var layer_i = 0, layer_ct = parent_group.artLayers.length; layer_i < layer_ct; ++layer_i)
			{
				var layer = parent_group.artLayers[layer_i];
				if (layer.visible)
				{
					var xmin = layer.bounds[0].as("px");
					var ymin = layer.bounds[1].as("px");
					var xmax = layer.bounds[2].as("px");
					var ymax = layer.bounds[3].as("px");

					var layer_base_name = layer.name.match(/\w+/g)[0]; // extract first word from layer name

					var file = {};
					file.id = file_id++;
					file.name = path_name + layer_base_name + ".png";
					file.path_name = path_name;
					file.base_name = layer_base_name;
					file.width = xmax - xmin;
					file.height = ymax - ymin;

					file.layer_name = layer.name;
					file.layer_x = xmin;
					file.layer_y = ymin;

					folder.files.push(file);
				}
			}

			if (folder.files.length > 0)
			{
				folders.push(folder);
				folder_id++;
			}
		}

		parseFolder(doc, "");
	}
	/* scope */ )();

	/* scope */ ;(function () // generate bones
	{
		var getByName = function (layers, name)
		{
			for (var i = 0, ct = layers.length; i < ct; ++i)
			{
				if (layers[i].name == name)
				{
					return layers[i];
				}
			}

			return null;
		}

		// look for a layer set named "root"
		//var root_layer = doc.layerSets.getByName("root");
		var root_layer = getByName(doc.layerSets, "root");

		if (root_layer)
		{
			var bone_id = 0;

			var parseBone = function (bone, parent, group)
			{
				var group_base_name = group.name.match(/\w+/g)[0]; // extract first word from group name

				bone.id = bone_id++;
				bone.parent = parent;
				bone.name = group_base_name;

				// look for an art layer named "bone"
				//var bone_layer = group.artLayers.getByName("bone");
				var bone_layer = getByName(group.artLayers, "bone");

				if (bone_layer)
				{
					var xmin = bone_layer.bounds[0].as("px");
					var ymin = bone_layer.bounds[1].as("px");
					var xmax = bone_layer.bounds[2].as("px");
					var ymax = bone_layer.bounds[3].as("px");

					bone.x = (xmin + xmax) / 2;
					bone.y = -(ymin + ymax) / 2;
					bone.w = (xmax - xmin);
					bone.h = (ymax + ymin);
				}
				else
				{
					bone.x = 0;
					bone.y = 0;
					bone.w = 0;
					bone.h = 0;
				}

				if (parent)
				{
					bone.local_x = bone.x - parent.x;
					bone.local_y = bone.y - parent.y;
				}
				else
				{
					bone.local_x = bone.x;
					bone.local_y = bone.y;
				}

				bone.local_angle = 0;
				bone.local_scale_x = 1;
				bone.local_scale_y = 1;

				bone.bones = [];

				for (var group_i = 0, group_ct = group.layerSets.length; group_i < group_ct; ++group_i)
				{
					var child_bone = parseBone({}, bone, group.layerSets[group_i]);
					bone.bones.push(child_bone);
				}

				return bone;
			}

			root_bone = parseBone({}, null, root_layer);
		}
	}
	/* scope */ )();

	/* scope */ ;(function () // generate objects
	{
		var findBone = function (bone, callback)
		{
			if (!bone)
			{
				return null;
			}

			if (callback(bone))
			{
				return bone;
			}

			for (var i = 0, ct = bone.bones.length; i < ct; ++i)
			{
				var temp_bone = findBone(bone.bones[i], callback);
				if (temp_bone)
				{
					return temp_bone;
				}
			}

			return null;
		}

		var findBoneByName = function (start_bone, bone_name)
		{
			return findBone(start_bone, function (bone) { return (bone.name == bone_name); })
		}

		// create objects for each file in each folder
		var object_id = 0;
		for (var folder_i = 0, folder_ct = folders.length; folder_i < folder_ct; ++folder_i)
		{
			var folder = folders[folder_ct - 1 - folder_i];
			for (var file_i = 0, file_ct = folder.files.length; file_i < file_ct; ++file_i)
			{
				var file = folder.files[file_ct - 1 - file_i];

				var object = {};
				object.id = object_id++;
				object.folder = folder.id;
				object.file = file.id;
				object.x = file.layer_x;
				object.y = -file.layer_y;

				// find a bone with the same name
				var bone = null;

				// layer.name format: "base_name bone(bone_name)"
				var match = file.layer_name.match(/\w+/g);
				for (var match_i = 1, match_ct = match.length; match_i < match_ct; match_i += 2)
				{
					if (match[match_i] == "bone")
					{
						var bone_name = match[match_i+1];
						bone = findBoneByName(root_bone, bone_name);
					}
				}

				if (!bone)
				{
					// layer.name format: "base_name"
					var bone_name = match[0];
					bone = findBoneByName(root_bone, bone_name);
				}

				if (!bone)
				{
					// group.name format: "base_name bone(bone_name)"
					var match = folder.group_name.match(/\w+/g);
					for (var match_i = 1, match_ct = match.length; match_i < match_ct; match_i += 2)
					{
						if (match[match_i] == "bone")
						{
							var bone_name = match[match_i+1];
							bone = findBoneByName(root_bone, bone_name);
						}
					}

					if (!bone)
					{
						// group.name format: "base_name"
						var bone_name = match[0];
						bone = findBoneByName(root_bone, bone_name);
					}
				}

				if (bone)
				{
					object.parent = bone;
					object.local_x = object.x - bone.x;
					object.local_y = object.y - bone.y;
				}
				else
				{
					object.parent = null;
					object.local_x = object.x;
					object.local_y = object.y;
				}

				object.local_angle = 0;
				object.local_scale_x = 1;
				object.local_scale_y = 1;

				objects.push(object);
			}
		}
	}
	/* scope */ )();

	/* scope */ ;(function () // calculate bone angles
	{
		// copy object transforms
		for (object_i = 0, object_ct = objects.length; object_i < object_ct; ++object_i)
		{
			var object = objects[object_i];

			object.fix_local_x = object.local_x;
			object.fix_local_y = object.local_y;
			object.fix_local_angle = object.local_angle;
			object.fix_local_scale_x = object.local_scale_x;
			object.fix_local_scale_y = object.local_scale_y;
		}

		if (root_bone)
		{
			// copy bone transforms
			var copyBone = function (bone)
			{
				// copy bone transform
				bone.fix_local_x = bone.local_x;
				bone.fix_local_y = bone.local_y;
				bone.fix_local_angle = bone.local_angle;
				bone.fix_local_scale_x = bone.local_scale_x;
				bone.fix_local_scale_y = bone.local_scale_y;

				// process all child bones
				for (var bone_i = 0, bone_ct = bone.bones.length; bone_i < bone_ct; ++bone_i)
				{
					var child_bone = bone.bones[bone_i];

					copyBone(child_bone);
				}
			}

			copyBone(root_bone);

			var fixBone = function (bone)
			{
				var bone_local_angle = 0;
				var bone_local_scale_x = 1;

				if (bone.bones.length >= 1)
				{
					// if a bone has one or more children, point at first child
					var child_bone = bone.bones[0];
					var dx = child_bone.x - bone.x;
					var dy = child_bone.y - bone.y;
					bone_local_angle = Math.atan2(dy, dx);
					bone_local_scale_x = Math.sqrt(dx*dx + dy*dy) / 200;
				}
				else if (bone.parent)
				{
					// else, if bone has parent, point away from parent
					var dx = bone.x - bone.parent.x;
					var dy = bone.y - bone.parent.y;
					bone_local_angle = Math.atan2(dy, dx);
					bone_local_scale_x = Math.sqrt(dx*dx + dy*dy) / 200;
				}

				// adjust bone angle
				bone.fix_local_angle += bone_local_angle;

				bone.fix_local_scale_x *= bone_local_scale_x;

				// rotate all the child bones back to world position
				for (var child_bone_i = 0, child_bone_ct = bone.bones.length; child_bone_i < child_bone_ct; ++child_bone_i)
				{
					var child_bone = bone.bones[child_bone_i];

					var tx = child_bone.fix_local_x;
					var ty = child_bone.fix_local_y;
					child_bone.fix_local_x = tx * Math.cos(-bone_local_angle) - ty * Math.sin(-bone_local_angle);
					child_bone.fix_local_y = tx * Math.sin(-bone_local_angle) + ty * Math.cos(-bone_local_angle);

					child_bone.fix_local_x /= bone_local_scale_x;

					child_bone.fix_local_angle -= bone_local_angle;

					child_bone.fix_local_scale_x /= bone_local_scale_x;
				}

				// rotate all the child objects back to world position
				for (object_i = 0, object_ct = objects.length; object_i < object_ct; ++object_i)
				{
					var object = objects[object_i];

					if (object.parent == bone)
					{
						object.fix_local_angle -= bone_local_angle;

						object.fix_local_scale_x /= bone_local_scale_x;
					}
				}

				// process all child bones
				for (var bone_i = 0, bone_ct = bone.bones.length; bone_i < bone_ct; ++bone_i)
				{
					var child_bone = bone.bones[bone_i];

					fixBone(child_bone);
				}
			}

			fixBone(root_bone);
		}
	}
	/* scope */ )();

	/* scope */ ;(function () // generate SCML
	{
		var scml = new File(out_path + "/" + doc.name.replace(".psd", ".scml"));
		scml.encoding = "UTF-8";
		scml.open("w");
		scml.writeln("<?xml version=\"1.0\" encoding=\"" + scml.encoding + "\"?>");
		scml.writeln("<spriter_data scml_version=\"1.0\" generator=\"psd2scml.jsx\" generator_version=\"pre1.0\">");
		// folder
		for (var folder_i = 0, folder_ct = folders.length; folder_i < folder_ct; ++folder_i)
		{
			var folder = folders[folder_i];
			scml.writeln("\t<folder id=\"" + folder.id + "\" name=\"" + folder.name + "\">");
			// file
			for (var file_i = 0, file_ct = folder.files.length; file_i < file_ct; ++file_i)
			{
				var file = folder.files[file_i];
				scml.writeln("\t\t<file id=\"" + file.id + "\" name=\"" + file.name + "\" width=\"" + file.width.toFixed(0) + "\" height=\"" + file.height.toFixed(0) + "\"/>");
			}
			scml.writeln("\t</folder>");
		}
		// entity
		var entity_name = doc.name.replace(".psd", "");
		scml.writeln("\t<entity id=\"0\" name=\"" + entity_name + "\">");
		// entity/animation
		scml.writeln("\t\t<animation id=\"0\" name=\"default\" length=\"1000\" looping=\"false\">");
		// entity/animation/mainline
		scml.writeln("\t\t\t<mainline>");
		scml.writeln("\t\t\t\t<key id=\"0\">");
		var timeline_id = 0;
		if (root_bone)
		{
			var writeBone = function (bone)
			{
				scml.writeln(
					"\t\t\t\t\t<bone_ref" + 
					" id=\"" + bone.id + "\"" + 
					((bone.parent)?(" parent=\"" + bone.parent.id + "\""):("")) + 
					" timeline=\"" + timeline_id + "\"" + 
					" key=\"0\"" + 
					"/>");
				++timeline_id;
				for (var i = 0, ct = bone.bones.length; i < ct; ++i)
				{
					writeBone(bone.bones[i]);
				}
			}
			writeBone(root_bone);
		}
		for (object_i = 0, object_ct = objects.length; object_i < object_ct; ++object_i)
		{
			var object = objects[object_i];
			scml.writeln(
				"\t\t\t\t\t<object_ref" + 
				" id=\"" + object.id + "\"" + 
				((object.parent)?(" parent=\"" + object.parent.id + "\""):("")) + 
				" timeline=\"" + timeline_id + "\"" + 
				" key=\"0\"" + 
				" z_index=\"" + object.id + "\"" + 
				"/>");
			++timeline_id;
		}
		scml.writeln("\t\t\t\t</key>");
		scml.writeln("\t\t\t</mainline>");
		// entity/animation/timeline
		var timeline_id = 0;
		if (root_bone)
		{
			var writeBone = function (bone)
			{
				scml.writeln("\t\t\t<timeline id=\"" + timeline_id + "\" name=\"" + bone.name + "\" object_type=\"bone\">");
				scml.writeln("\t\t\t\t<key id=\"0\" spin=\"0\">");
				scml.writeln("\t\t\t\t\t<bone x=\"" + bone.fix_local_x.toFixed(2) + "\" y=\"" + bone.fix_local_y.toFixed(2) + "\" angle=\"" + r2d(bone.fix_local_angle).toFixed(2) + "\" scale_x=\"" + bone.fix_local_scale_x.toFixed(2) + "\" scale_y=\"" + bone.fix_local_scale_y.toFixed(2) + "\"/>");
				scml.writeln("\t\t\t\t</key>");
				scml.writeln("\t\t\t</timeline>");
				++timeline_id;
				for (var i = 0, ct = bone.bones.length; i < ct; ++i)
				{
					writeBone(bone.bones[i]);
				}
			}
			writeBone(root_bone);
		}
		for (object_i = 0, object_ct = objects.length; object_i < object_ct; ++object_i)
		{
			var object = objects[object_i];
			var file = folders[object.folder].files[object.file];
			var object_name = "object-" + file.base_name;
			var pivot_x = (0 - (object.fix_local_x / file.width ));
			var pivot_y = (1 - (object.fix_local_y / file.height));
			scml.writeln("\t\t\t<timeline id=\"" + timeline_id + "\" name=\"" + object_name + "\">");
			scml.writeln("\t\t\t\t<key id=\"0\" spin=\"0\">");
			scml.writeln("\t\t\t\t\t<object folder=\"" + object.folder + "\" file=\"" + object.file + "\" x=\"0\" y=\"0\" pivot_x=\"" + pivot_x.toFixed(2) + "\" pivot_y=\"" + pivot_y.toFixed(2) + "\" angle=\"" + r2d(object.fix_local_angle).toFixed(2) + "\" scale_x=\"" + object.fix_local_scale_x.toFixed(2) + "\" scale_y=\"" + object.fix_local_scale_y.toFixed(2) + "\"/>");
			scml.writeln("\t\t\t\t</key>");
			scml.writeln("\t\t\t</timeline>");
			++timeline_id;
		}
		scml.writeln("\t\t</animation>");
		scml.writeln("\t</entity>");
		scml.writeln("</spriter_data>");
		scml.close();
	}
	/* scope */ )();

	/* scope */ ;(function () // generate Spine JSON skeleton
	{
		var json = {};
		//json.bones = {}; // version < 1.0.9
		json.bones = [];
		if (root_bone)
		{
			var writeBone = function (bone)
			{
				//var json_bone = json.bones[bone.name] = {}; // version < 1.0.9
				var json_bone = {};
				json.bones.push(json_bone);
				json_bone.name = bone.name;
				if (bone.parent)
				{
					json_bone.parent = bone.parent.name;
				}
				json_bone.x = bone.local_x;
				json_bone.y = bone.local_y;

				for (var i = 0, ct = bone.bones.length; i < ct; ++i)
				{
					writeBone(bone.bones[i]);
				}
			}
			writeBone(root_bone);
		}
		else
		{
			json.bones.push({ name: "root" }); // need at least one root bone
		}
		//json.slots = {}; // version < 1.0.9
		json.slots = [];
		for (object_i = 0, object_ct = objects.length; object_i < object_ct; ++object_i)
		{
			var object = objects[object_i];
			var folder = folders[object.folder];
			var file = folder.files[object.file];
			//var json_slot = json.slots[file.base_name] = {}; // version < 1.0.9
			var json_slot = {};
			json.slots.push(json_slot);
			var bone_name = "root"; // need at least one root bone
			if (root_bone && object.parent)
			{
				bone_name = object.parent.name;
			}
			json_slot.name = file.base_name;//bone_name;
			json_slot.bone = bone_name;
			json_slot.attachment = file.base_name;
		}
		json.skins = {};
		var skin = json.skins[doc.name.replace(".psd", "")] = {};
		for (object_i = 0, object_ct = objects.length; object_i < object_ct; ++object_i)
		{
			var object = objects[object_i];
			var folder = folders[object.folder];
			var file = folder.files[object.file];
			var slot_name = file.base_name;
			var json_attachment = skin[slot_name] || (skin[slot_name] = {});
			var json_file = json_attachment[file.base_name] = {};
			var x = object.local_x + (file.width / 2);
			var y = object.local_y - (file.height / 2);
			json_file.x = round(x, 2);
			json_file.y = round(y, 2);
			json_file.name = file.path_name + file.base_name;
			json_file.width = 0 | file.width;
			json_file.height = 0 | file.height;
		}

		var json_file = new File(out_path + "/" + doc.name.replace(".psd", ".json"));
		json_file.encoding = "UTF-8";
		json_file.open("w");
		json_file.write(JSON.stringify(json, null, '\t'));
		json_file.close();
	}
	/* scope */ )();

	/* scope */ ;(function () // generate PNG's
	{
		var clone_doc = doc.duplicate();

		clone_doc.activeLayer = clone_doc.artLayers.add();
		removeAllInvisibleLayerSets(clone_doc);
		removeAllInvisibleArtLayers(clone_doc);
		removeAllEmptyLayerSets(clone_doc);
		clone_doc.activeLayer.remove();

		setInvisibleAllArtLayers(clone_doc);

		var parseFolder = function (parent_group, folder_name)
		{
			if (folder_name.length > 0)
			{
				var out_folder = new Folder(out_path + "/" + folder_name);
				if (!out_folder.exists) { out_folder.create(); }
			}

			var path_name = ((folder_name.length > 0)?(folder_name + "/"):(""));

			for (var group_i = 0, group_ct = parent_group.layerSets.length; group_i < group_ct; ++group_i)
			{
				var group = parent_group.layerSets[group_i];
				var group_base_name = group.name.match(/\w+/g)[0]; // extract first word from group name
				parseFolder(group, path_name + group_base_name);
			}

			for (var layer_i = 0, layer_ct = parent_group.artLayers.length; layer_i < layer_ct; ++layer_i)
			{
				var layer = parent_group.artLayers[layer_i];
				var layer_base_name = layer.name.match(/\w+/g)[0]; // extract first word from layer name
				var png_name = out_path + "/" + path_name + layer_base_name + ".png";
				var png = new File(png_name);
				if (!png.exists || true)
				{
					layer.visible = true;
					var trim_doc = clone_doc.duplicate();
					trim_doc.trim(TrimType.TRANSPARENT, true, true, true, true);
					var png_save_options = new PNGSaveOptions();
					trim_doc.saveAs(png, png_save_options, true, Extension.LOWERCASE);
					//var export_options_sfw = new ExportOptionsSaveForWeb();
					//export_options_sfw.format = SaveDocumentType.PNG;
					//export_options_sfw.PNG8 = false;
					//export_options_sfw.quality = 100;
					//trim_doc.exportDocument(png, ExportType.SAVEFORWEB, export_options_sfw);
					trim_doc.close(SaveOptions.DONOTSAVECHANGES);
					layer.visible = false;
				}
			}
		}

		parseFolder(clone_doc, "");

		clone_doc.close(SaveOptions.DONOTSAVECHANGES);
	}
	/* scope */ )();

	return 0;
}

main();

///////////////////////////////////////////////////////////////////////////////
// Function: setInvisibleAllArtLayers
// Usage: unlock and make invisible all art layers, recursively
// Input: document or layerset
// Return: all art layers are unlocked and invisible
///////////////////////////////////////////////////////////////////////////////
function setInvisibleAllArtLayers(obj) {
	for( var i = 0; i < obj.artLayers.length; i++) {
		obj.artLayers[i].allLocked = false;
		obj.artLayers[i].visible = false;
	}
	for( var i = 0; i < obj.layerSets.length; i++) {
		setInvisibleAllArtLayers(obj.layerSets[i]);
	}
}


///////////////////////////////////////////////////////////////////////////////
// Function: removeAllInvisibleArtLayers
// Usage: remove all the invisible art layers, recursively
// Input: document or layer set
// Return: <none>, all layers that were invisible are now gone
///////////////////////////////////////////////////////////////////////////////
function removeAllInvisibleArtLayers(obj) {
	for( var i = obj.artLayers.length-1; 0 <= i; i--) {
		try {
			if(!obj.artLayers[i].visible) {
				obj.artLayers[i].remove();
			}
		}
		catch (e) {
		}
	}
	for( var i = obj.layerSets.length-1; 0 <= i; i--) {
		removeAllInvisibleArtLayers(obj.layerSets[i]);
	}
}


///////////////////////////////////////////////////////////////////////////////
// Function: removeAllInvisibleLayerSets
// Usage: remove all the invisible layer sets, recursively
// Input: document or layer set
// Return: <none>, all layers that were invisible are now gone
///////////////////////////////////////////////////////////////////////////////
function removeAllInvisibleLayerSets(obj) {
	for( var i = obj.layerSets.length-1; 0 <= i; i--) {
		try {
			if(!obj.layerSets[i].visible) {
				obj.layerSets[i].remove();
			}
		}
		catch (e) {
		}
	}
	for( var i = obj.layerSets.length-1; 0 <= i; i--) {
		removeAllInvisibleLayerSets(obj.layerSets[i]);
	}
}


///////////////////////////////////////////////////////////////////////////////
// Function: removeAllEmptyLayerSets
// Usage: find all empty layer sets and remove them, recursively
// Input: document or layer set
// Return: empty layer sets are now gone
///////////////////////////////////////////////////////////////////////////////
function removeAllEmptyLayerSets(obj) {
	var foundEmpty = true;
	for( var i = obj.layerSets.length-1; 0 <= i; i--) {
		if( removeAllEmptyLayerSets(obj.layerSets[i])) {
			obj.layerSets[i].remove();
		} else {
			foundEmpty = false;
		}
	}
	if (obj.artLayers.length > 0) {
		foundEmpty = false;
	}
	return foundEmpty;
}

