import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  DELETE_OFFLINE_RESOURCES_CANCEL,
  DELETE_OFFLINE_RESOURCES_CONFIRM,
  DELETE_OFFLINE_RESOURCES_MESSAGE,
  DELETE_OFFLINE_RESOURCES_PARTIAL_FAIL_MESSAGE,
  DELETE_OFFLINE_RESOURCES_PARTIAL_FAIL_TITLE,
  DELETE_OFFLINE_RESOURCES_TITLE,
} from '../constants/messages';
import type {
  DeviceStorageSummary,
  OtherProjectStorageGroup,
  StorageInventoryResource,
} from '../types/prepareOffline/types';
import {
  deleteSelectedDownloadResources,
  getDeviceStorageSummary,
  getOtherProjectsStorageInventory,
} from '../services/prepareOfflineStorageManagement';
import { logger } from '../utils/logger';

const log = logger.create('usePrepareOfflineStorageManagement');

const EMPTY_SUMMARY: DeviceStorageSummary = {
  availableBytes: null,
  totalDeviceBytes: null,
  fluentUsedBytes: 0,
};

export function usePrepareOfflineStorageManagement(
  projectId: number | null,
  inventoryRefreshSignal?: string,
) {
  const [summary, setSummary] = useState<DeviceStorageSummary>(EMPTY_SUMMARY);
  const [groups, setGroups] = useState<OtherProjectStorageGroup[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<number>>(
    () => new Set(),
  );
  const reloadGenerationRef = useRef(0);

  const resourceById = useMemo(() => {
    const map = new Map<string, StorageInventoryResource>();
    for (const group of groups) {
      for (const resource of group.resources) {
        map.set(resource.id, resource);
      }
    }
    return map;
  }, [groups]);

  const selectedResources = useMemo(
    () =>
      [...selectedIds]
        .map(id => resourceById.get(id))
        .filter((resource): resource is StorageInventoryResource =>
          Boolean(resource),
        ),
    [resourceById, selectedIds],
  );

  const bytesToFree = useMemo(
    () => selectedResources.reduce((sum, resource) => sum + resource.bytes, 0),
    [selectedResources],
  );

  const reload = useCallback(async () => {
    if (projectId === null || projectId === undefined) {
      setSummary(EMPTY_SUMMARY);
      setGroups([]);
      setSelectedIds(new Set());
      setInitialLoaded(true);
      return;
    }

    const generation = reloadGenerationRef.current + 1;
    reloadGenerationRef.current = generation;

    try {
      const [nextSummary, nextGroups] = await Promise.all([
        getDeviceStorageSummary(),
        getOtherProjectsStorageInventory(projectId),
      ]);

      if (reloadGenerationRef.current !== generation) {
        return;
      }

      setSummary(nextSummary);
      setGroups(nextGroups);
      setSelectedIds(previous => {
        const validIds = new Set(
          nextGroups.flatMap(group =>
            group.resources.map(resource => resource.id),
          ),
        );
        return new Set([...previous].filter(id => validIds.has(id)));
      });
    } catch (error) {
      if (reloadGenerationRef.current !== generation) {
        return;
      }

      log.error('Failed to reload device storage inventory', {
        error,
        projectId,
      });
      setSummary(EMPTY_SUMMARY);
      setGroups([]);
      setSelectedIds(new Set());
    } finally {
      if (reloadGenerationRef.current === generation) {
        setInitialLoaded(true);
      }
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const inventoryRefreshInitializedRef = useRef(false);

  useEffect(() => {
    if (inventoryRefreshSignal === undefined) {
      return;
    }

    if (!inventoryRefreshInitializedRef.current) {
      inventoryRefreshInitializedRef.current = true;
      return;
    }

    void reload();
  }, [inventoryRefreshSignal, reload]);

  const toggleResourceSelected = useCallback((resourceId: string) => {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(resourceId)) {
        next.delete(resourceId);
      } else {
        next.add(resourceId);
      }
      return next;
    });
  }, []);

  const toggleProjectExpanded = useCallback((groupProjectId: number) => {
    setExpandedProjectIds(previous => {
      const next = new Set(previous);
      if (next.has(groupProjectId)) {
        next.delete(groupProjectId);
      } else {
        next.add(groupProjectId);
      }
      return next;
    });
  }, []);

  const performDelete = useCallback(async () => {
    if (
      projectId === null ||
      projectId === undefined ||
      selectedResources.length === 0
    ) {
      return;
    }

    setDeleting(true);
    try {
      const result = await deleteSelectedDownloadResources(
        selectedResources,
        projectId,
      );

      if (result.failed.length > 0) {
        Alert.alert(
          DELETE_OFFLINE_RESOURCES_PARTIAL_FAIL_TITLE,
          DELETE_OFFLINE_RESOURCES_PARTIAL_FAIL_MESSAGE,
        );
      }

      setSelectedIds(new Set());
      await reload();
    } finally {
      setDeleting(false);
    }
  }, [projectId, reload, selectedResources]);

  const requestDeleteSelected = useCallback(() => {
    if (selectedResources.length === 0 || deleting) {
      return;
    }

    Alert.alert(
      DELETE_OFFLINE_RESOURCES_TITLE,
      DELETE_OFFLINE_RESOURCES_MESSAGE,
      [
        { text: DELETE_OFFLINE_RESOURCES_CANCEL, style: 'cancel' },
        {
          text: DELETE_OFFLINE_RESOURCES_CONFIRM,
          style: 'destructive',
          onPress: () => {
            void performDelete();
          },
        },
      ],
    );
  }, [deleting, performDelete, selectedResources.length]);

  return {
    summary,
    groups,
    initialLoaded,
    deleting,
    selectedIds,
    expandedProjectIds,
    bytesToFree,
    hasSelection: selectedResources.length > 0,
    toggleResourceSelected,
    toggleProjectExpanded,
    requestDeleteSelected,
    reload,
  };
}
