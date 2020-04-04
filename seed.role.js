const mongoose = require('mongoose');

// Data array containing seed data - documents organized by Model
var data = [
    {
        'Name': 'Viewer',
        'PermissionLevel': 0,
    },
    {
        'Name': 'Manager',
        'PermissionLevel': 1,
    }
];


const RoleSchema = {
    Name: { type: String, required: true, unique: true },
    PermissionLevel: {type: Number,  required: true, default: 1}
};

mongoose.connect("mongodb://localhost/test").then(r => {
    var model = mongoose.model('Role', RoleSchema, 'roles');

    model.create(data).then(r => {
        process.exit();
    });
});

