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

mongoose.connect("mongodb://localhost/test");



mongoose.model('Role', RoleSchema, 'roles');
mongoose.model('Role').deleteMany({}, (err, res) =>{
    mongoose.model('Role').create(data);
});

process.exit();
