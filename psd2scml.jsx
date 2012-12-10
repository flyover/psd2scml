#target photoshop

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
				if (group.visible)
				{
					parseFolder(group, path_name + group.name);
				}
			}

			var folder = {};
			folder.id = folder_id;
			folder.name = folder_name;
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

					var base_name = layer.name.match(/\w+/g)[0]; // extract first word from layer name

					var file = {};
					file.id = file_id++;
					file.name = path_name + base_name + ".png";
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
				bone.id = bone_id++;
				bone.parent = (parent)?(parent.id):(-1);
				bone.name = group.name;

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
				var bone = findBone(root_bone, function (bone)
				{
					// layer.name format
					// "base_name"
					// "base_name bone(bone_name)"
					var match = file.layer_name.match(/\w+/g);
					var bone_name = match[0];
					for (var match_i = 1, match_ct = match.length; match_i < match_ct; match_i += 2)
					{
						if (match[match_i] == "bone")
						{
							bone_name = match[match_i+1];
						}
					}
					if (bone.name == bone_name)
					{
						return true;
					}

					return false;
				});
				if (bone)
				{
					object.parent = bone.id;
					object.local_x = object.x - bone.x;
					object.local_y = object.y - bone.y;
				}
				else
				{
					object.parent = -1;
					object.local_x = object.x;
					object.local_y = object.y;
				}

				objects.push(object);
			}
		}
	}
	/* scope */ )();

	/* scope */ ;(function () // generate SCML
	{
		var scml = new File(out_path + "/" + doc.name.replace(".psd", ".scml"));
		scml.encoding = "UTF-8";
		scml.open("w");
		scml.writeln("<?xml version=\"1.0\" encoding=\"" + scml.encoding + "\"?>");
		scml.writeln("<spriter_data scml_version=\"1.0\" generator=\"BrashMonkey Spriter\" generator_version=\"a4.1\">");
		// folder
		for (var folder_i = 0, folder_ct = folders.length; folder_i < folder_ct; ++folder_i)
		{
			var folder = folders[folder_i];
			scml.writeln("\t<folder id=\"" + folder.id + "\" name=\"" + folder.name + "\">");
			// file
			for (var file_i = 0, file_ct = folder.files.length; file_i < file_ct; ++file_i)
			{
				var file = folder.files[file_i];
				scml.writeln("\t\t<file id=\"" + file.id + "\" name=\"" + file.name + "\" width=\"" + file.width + "\" height=\"" + file.height + "\"/>");
			}
			scml.writeln("\t</folder>");
		}
		// entity
		scml.writeln("\t<entity id=\"0\" name=\"\">");
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
					((bone.parent != -1)?(" parent=\"" + bone.parent + "\""):("")) + 
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
				((object.parent != -1)?(" parent=\"" + object.parent + "\""):("")) + 
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
				scml.writeln("\t\t\t<timeline id=\"" + timeline_id + "\" name=\"" + bone.name + "\">");
				scml.writeln("\t\t\t\t<key id=\"0\" spin=\"0\">");
				scml.writeln("\t\t\t\t\t<bone x=\"" + bone.local_x + "\" y=\"" + bone.local_y + "\" angle=\"0\" scale_x=\"1\" scale_y=\"1\"/>");
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
			scml.writeln("\t\t\t<timeline id=\"" + timeline_id + "\">");
			scml.writeln("\t\t\t\t<key id=\"0\" spin=\"0\">");
			scml.writeln("\t\t\t\t\t<object folder=\"" + object.folder + "\" file=\"" + object.file + "\" x=\"" + object.local_x + "\" y=\"" + object.local_y + "\"/>");
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
				parseFolder(group, path_name + group.name);
			}

			for (var layer_i = 0, layer_ct = parent_group.artLayers.length; layer_i < layer_ct; ++layer_i)
			{
				var layer = parent_group.artLayers[layer_i];
				var base_name = layer.name.match(/\w+/g)[0]; // extract first word from layer name
				var png_name = out_path + "/" + path_name + base_name + ".png";
				var png = new File(png_name);
				if (!png.exists || true)
				{
					layer.visible = true;
					var trim_doc = clone_doc.duplicate();
					trim_doc.trim(TrimType.TRANSPARENT, true, true, true, true);
					var png_save_options = new PNGSaveOptions();
					trim_doc.saveAs(png, png_save_options, true, Extension.LOWERCASE);
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

