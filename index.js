const fs = require('fs')
var _ = require('lodash');
const { parse } = require('csv-parse')
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();

function validateAddress(addresses) {

    const addressArray = addresses.map(cur => {

        const obj = cur

        if (!cur.address) return undefined

        if (cur.type == 'email') {
            obj.address = String(cur.address).match(/([a-z0-9.]+@[a-z]+\.[a-z]{2,3})/g)?.shift()
            return !obj.address ? undefined : obj
        }

        if (cur.type == 'phone') {
            try {
                const number = phoneUtil.parse(cur.address, 'BR')

                if (!phoneUtil.isValidNumber(number)) return undefined

                obj.address = phoneUtil.formatOutOfCountryCallingNumber(number).replace(/[+\s-]/g, '')

                return obj
            } catch {
                return undefined
            }
        }

        return obj
    }).filter(cur => cur != undefined)

    return addressArray
}

function createElement(line) {

    const element = new Object({ addresses: [] })

    Object.assign(element, line)

    Object.entries(element).filter(([key]) => /\s/g.test(key)).forEach(([key, value]) => {
        const address = key.split(' ')
        const type = address.shift()
        const tags = address

        value.split(/[,/]/g).forEach(cur => {
            const obj = {
                type,
                tags,
                address: cur
            }
            element.addresses.push(obj)
        })
    })

    Object.entries(element).filter(([key]) => /\s/g.test(key)).forEach(([key]) => {
        delete element[key]
    })

    element.groups = element.groups.flatMap(group => group.split(/[,/]/g)).map(value => value.trim()).filter(value => !!value)
    element.invisible = ['1', 'yes'].some(value => element.invisible == value)
    element.see_all = ['1', 'yes'].some(value => element.see_all == value)
    element.addresses = validateAddress(element.addresses)

    return element
}


function loadFile() {
    return new Promise((resolve, reject) => {

        const list = []
        const stream = fs.createReadStream(__dirname + '/index.csv')

        const parseFile = parse({
            columns: header =>
                header.map(column => column == 'group' ? 'groups' : column), group_columns_by_name: true
        })

        stream.pipe(parseFile)

        parseFile.on('data', async line => {

            const elementAlreadyExists = list.find((element) => element.eid == line.eid)
            const element = createElement(line)

            if (!elementAlreadyExists) {
                list.push(element)
            } else {
                elementAlreadyExists.addresses = _.union(elementAlreadyExists.addresses, element.addresses)
                elementAlreadyExists.groups = _.union(elementAlreadyExists.groups, element.groups)
            }

        }).on('end', () => {
            resolve(list);
        }).on('error', err => {
            reject(err);
        });
    })

}

const deleteFile = async (filename) => {
    try {
        await fs.promises.stat(filename);
    } catch {
        return;
    }

    await fs.promises.unlink(filename);
};

async function run() {
    const list = await loadFile()

    await deleteFile(__dirname + '/index.json')

    fs.writeFile(__dirname + '/index.json', JSON.stringify(list, null, '\t'), function (err, result) {
        if (err) console.log('error', err);
    })
}

run()
