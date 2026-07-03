'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  FlattenedVerificationItem,
  VerificationCardFlow,
  VerificationDecision
} from '@/components/verification/verification-card-flow';
import {
  MissionMaterielVerificationItemStatus,
  MissionVerificationTree,
  VerificationTreeContainerNode,
  VerificationTreeItemNode,
  VerificationTreeNode
} from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

function orderedFlatten(node: VerificationTreeContainerNode): FlattenedVerificationItem[] {
  const directItems = node.children.filter((c): c is VerificationTreeItemNode => c.kind === 'item').map((c) => ({ ...c, containerName: node.name }));
  const subContainers = node.children.filter((c): c is VerificationTreeContainerNode => c.kind === 'container');
  return [...directItems, ...subContainers.flatMap((c) => orderedFlatten(c))];
}

type FlowState = { containerId: string; containerName: string; items: FlattenedVerificationItem[] };

export default function VerificationScopedPage() {
  const params = useParams<{ missionId: string; materielAssignmentId: string }>();
  const router = useRouter();
  const { missionId, materielAssignmentId } = params;

  const [tree, setTree] = useState<MissionVerificationTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ root: true });
  const [flow, setFlow] = useState<FlowState | null>(null);

  const loadTree = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      router.replace('/login');
      return;
    }

    const token = await getAccessToken();
    const res = await fetch(`/api/verification/missions/${missionId}/materiel/${materielAssignmentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? 'Impossible de charger la vérification de ce matériel.');
      setLoading(false);
      return;
    }

    const data = (await res.json()) as MissionVerificationTree;
    setTree(data);
    setLoading(false);
  }, [missionId, materielAssignmentId, router]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  async function handleDecide(item: FlattenedVerificationItem, status: MissionMaterielVerificationItemStatus, quantityPresent: number) {
    const token = await getAccessToken();
    const res = await fetch(`/api/verification/missions/${missionId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        mission_materiel_assignment_id: materielAssignmentId,
        child_type_id: item.child_type_id,
        status,
        quantity_present: status === 'partial' ? quantityPresent : null,
        note: null
      })
    });
    return res.ok;
  }

  function launch(node: VerificationTreeContainerNode) {
    const items = orderedFlatten(node);
    if (items.length === 0) return;
    setFlow({ containerId: node.id, containerName: node.name, items });
  }

  function handleFlowBack() {
    setFlow(null);
    void loadTree();
  }

  function handleFlowFinish(_decisions: VerificationDecision[]) {
    setFlow(null);
    void loadTree();
  }

  if (loading) {
    return <p className="text-sm text-ink-2">Chargement de la vérification...</p>;
  }

  if (error && !tree) {
    return <p className="text-sm text-bad">{error}</p>;
  }

  if (!tree) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/verification" className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
          <Icon name="arrow_back" size={18} />
          Mes missions
        </Link>
      </div>

      <div>
        <h1 className="text-[22px] font-black leading-tight tracking-[-0.02em] text-ink">Vérification</h1>
        <p className="mt-1 text-sm text-ink-2">{tree.mission_title}</p>
      </div>

      {error ? <p className="text-sm text-bad">{error}</p> : null}

      {flow ? (
        <VerificationCardFlow
          items={flow.items}
          rootName={flow.containerName}
          onBack={handleFlowBack}
          onFinish={handleFlowFinish}
          onDecide={handleDecide}
        />
      ) : (
        <VerificationTree node={tree.root} depth={0} expanded={expanded} setExpanded={setExpanded} onVerify={launch} />
      )}
    </div>
  );
}

function VerificationTree({
  node,
  depth,
  expanded,
  setExpanded,
  onVerify
}: {
  node: VerificationTreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onVerify: (node: VerificationTreeContainerNode) => void;
}) {
  if (node.kind === 'item') {
    return <ItemRow node={node} depth={depth} />;
  }

  const isOpen = expanded[node.id] ?? false;
  const hasChildren = node.children.length > 0;
  const hasItems = node.totalItems > 0;

  return (
    <div className="flex flex-col">
      <div
        onClick={() => hasChildren && setExpanded((e) => ({ ...e, [node.id]: !isOpen }))}
        style={{ marginLeft: depth * 16 }}
        className={cn(
          'mb-1.5 flex items-center gap-2.5 rounded-[14px] px-3.5 py-3',
          depth === 0 ? 'bg-surface' : 'border border-line bg-surface-card',
          hasChildren && 'cursor-pointer'
        )}
      >
        {hasChildren ? (
          <Icon
            name="chevron_right"
            size={16}
            className={cn('shrink-0 text-ink-3 transition-transform duration-150', isOpen && 'rotate-90')}
          />
        ) : null}
        <span className={cn('flex-1 truncate', depth === 0 ? 'text-[17px] font-black text-ink' : 'text-sm font-bold text-ink')}>
          {node.name}
        </span>
        <ContainerStatus node={node} />
        {hasItems ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onVerify(node);
            }}
            className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-for"
          >
            Vérifier
          </button>
        ) : null}
      </div>

      {hasChildren && isOpen
        ? node.children.map((child) => (
            <VerificationTree key={child.id} node={child} depth={depth + 1} expanded={expanded} setExpanded={setExpanded} onVerify={onVerify} />
          ))
        : null}
    </div>
  );
}

function ContainerStatus({ node }: { node: VerificationTreeContainerNode }) {
  if (node.checkedItems === 0) return null;

  if (node.missingItems > 0) {
    return (
      <Badge tone="bad" className="shrink-0 whitespace-nowrap">
        {node.missingItems} manquant{node.missingItems > 1 ? 's' : ''}
      </Badge>
    );
  }

  if (node.checkedItems >= node.totalItems) {
    return (
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok-text">
        <Icon name="check" size={14} />
      </span>
    );
  }

  return <span className="shrink-0 whitespace-nowrap text-[11px] font-bold text-ink-3">{node.checkedItems}/{node.totalItems} vérifiés</span>;
}

function ItemRow({ node, depth }: { node: VerificationTreeItemNode; depth: number }) {
  return (
    <div
      style={{ marginLeft: depth * 16 }}
      className="mb-1.5 flex items-center gap-2.5 rounded-[14px] border border-line bg-surface-card px-3.5 py-2.5"
    >
      <span className="flex-1 truncate text-sm text-ink">
        {node.name}
        {node.quantity > 1 ? ` (×${node.quantity})` : ''}
      </span>
      <ItemStatus node={node} />
    </div>
  );
}

function ItemStatus({ node }: { node: VerificationTreeItemNode }) {
  if (!node.check) {
    return <span className="shrink-0 text-[11px] text-ink-3">Non vérifié</span>;
  }

  if (node.check.status === 'missing') {
    return (
      <Badge tone="bad" className="shrink-0 whitespace-nowrap">
        ✕ Manquant
      </Badge>
    );
  }

  if (node.check.status === 'partial') {
    return (
      <Badge tone="warn" className="shrink-0 whitespace-nowrap">
        {node.check.quantity_present ?? 0}/{node.quantity} présents
      </Badge>
    );
  }

  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok-text">
      <Icon name="check" size={13} />
    </span>
  );
}
