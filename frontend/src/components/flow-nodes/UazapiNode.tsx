import { memo } from 'react';
import { NodeProps } from 'reactflow';
import { BaseNode } from './BaseNode';
import { uazapiLabels } from './UazapiConfig';
export const UazapiNode = memo((props: NodeProps) => <BaseNode {...props} icon="🧩" label="Uazapi" color="#25d366" description={uazapiLabels[props.data.config?.composition?.type] || 'Configure a mensagem'} onDelete={props.data.onDelete} />);
UazapiNode.displayName = 'UazapiNode';
