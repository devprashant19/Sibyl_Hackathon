import * as pulumi from "@pulumi/pulumi";

// Placeholder Pulumi program: it provisions no resources yet. The Kubernetes worker pools are
// defined in ./terraform. Running `pulumi up` on this stack creates an empty stack.
const stack = pulumi.getStack();

export const provisioned: string[] = [];
export const note = `stack ${stack}: no resources are defined in the Pulumi program; see infra/terraform`;
