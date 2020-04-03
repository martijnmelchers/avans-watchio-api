// @ts-ignore
import { Seeder } from 'mongoose-data-seed';
import Roles,{ IRole } from '../src/documents/role.interface';


const data= [
    {
        Name: "Viewer",
        PermissionLevel:  0,
    },
    {
        Name: "Manager",
        PermissionLevel: 1,
    }
];

class RoleSeeder extends Seeder {
    async shouldRun(){
        return Roles.countDocuments()
            .exec().then(count => count === 0);
    }

    async run() {
        return Roles.create(data);
    }
}
export default RoleSeeder
