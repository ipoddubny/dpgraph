'use strict';

// Not checked:
//  - ExecIf
//  - Macro, MacroIf
//  - Dial, Queue predial, postdial hooks
//  - periodic hooks
//  - hangup handlers
//  - TRANSFER_CONTEXT, FORWARD_CONTEXT
//  - Originate(Local,...,) & Originate(...,...,exten,app,args)
//  - DIALPLAN_EXISTS

const fs = require('fs');

const app2type = {
  'Goto': 'goto',
  'GotoIf': 'goto',
  'GotoIfTime': 'goto',
  'Gosub': 'gosub',
  'GosubIf': 'gosub',
  'Macro': 'macro',
  'MacroIf': 'macro'
};

const type2style = {
  'goto': '',
  'gosub': '[color=green]',
  'macro': '[color=darkgreen]',
  'lookup': '[color=red, style=dotted]',
  'include': '[color=blue]',
  'local': '[color=salmon2, penwidth=1.5]'
};

let links = [];

function addLink (from, to, type) {
  type = type || 'goto';

  let style = type2style[type] || '';
  let str = `"${from}" -> "${to}"${style}`;
  if (links.indexOf(str) === -1) {
    links.push(str);
  }
}

function getGotoContext (addr) {
  let split = addr.split(',');
  if (split.length < 3) {
    return null;
  } else {
    return split[0];
  }
}

function stripVars (args) {
  let pargs;

  do {
    pargs = args;
    args = args.replace(/\${[^{}]*}/g, 'VARIABLE');
    args = args.replace(/\$\[[^\[\]]*\]/g, 'CALCULATION');
    args = args.replace(/\([^()]*\)/g, '');
  } while (args !== pargs);

  return args;
}

function checkApp (app, args) {
  let destContext;

  args = stripVars(args);

  switch (app) {
    case 'Goto':
    case 'Gosub':
      destContext = getGotoContext(args);

      if (destContext) {
        addLink(context, destContext, app2type[app]);
      }
      break;

    case 'GotoIf':
    case 'GotoIfTime':
    case 'GosubIf':

      let matches = args.match(/\?([^?:]+)(?::([^?:]+))$/);

      if (matches) {
        destContext = getGotoContext(matches[1]);
        if (destContext) {
          addLink(context, destContext, app2type[app]);
        }

        if (matches[2]) {
          destContext = getGotoContext(matches[2]);
          if (destContext) {
            addLink(context, destContext, app2type[app]);
          }
        }
      }
      break;

    case 'Macro':
    case 'MacroIf':
      console.log('# warning! macros are not supported', app);
      break;

    case 'Dial':
      let dmatches = args.match(/Local\/[^@]+@([^,()]+)/);

      if (dmatches) {
        addLink(context, dmatches[1], 'local');
      }
      break;
  }
}

if (process.argv.length !== 3) {
  console.log(`Usage: node ${process.argv[1]} FILENAME`);
  process.exit(1);
}

const dialplan = fs.readFileSync(process.argv[2], 'utf-8');

let context = '---';

dialplan.split('\n').forEach(function (line) {
  let app, args;

  // new extension starts
  let matches = line.match(/'([^']+)'(?: \(CID match '[^']*'\))? =>\s+(\d+)\.\s(\w+)\((.*)\)/);
  if (matches) {
    // extension matches[1] is not used
    // priority matches[2] is not used
    app = matches[3];
    args = matches[4];
    checkApp(app, args);
    return;
  }

  // next line describing extension
  matches = line.match(/^\s+(?:\[\w+\])?\s+(\d+)\.\s(\w+)\((.*)\)/);
  if (matches) {
    // priority matches[1] is not used
    app = matches[2];
    args = matches[3];
    checkApp(app, args);
    return;
  }

  // start of a new context
  matches = line.match(/^\[ Context '([^']+)' created by/);
  if (matches) {
    context = matches[1];
    return;
  }

  // include
  matches = line.match(/Include =>\s+'([^']+)'/);
  if (matches) {
    let destContext = matches[1];
    addLink(context, destContext, 'include');
    return;
  }
});

console.log(`
digraph {
${links.map(link => '  ' + link).join('\n')}
}
`);
