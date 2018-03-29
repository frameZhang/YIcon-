import './UserProject.scss';
import axios from 'axios';
import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { findDOMNode } from 'react-dom';
import { autobind } from 'core-decorators';
import { Link } from 'react-router';
import ClipboardButton from 'react-clipboard.js';
import { SubTitle, Content, Menu, Main } from '../../components/';
import SliderSize from '../../components/SliderSize/SliderSize';
import confirm from '../../components/common/Dialog/Confirm.jsx';
import { replace, push } from 'react-router-redux';
import Dialog from '../../components/common/Dialog/Index.jsx';
import DownloadDialog from '../../components/DownloadDialog/DownloadDialog.jsx';
import UpdateDialog from '../../components/UpdateDialog/UpdateDialog.jsx';
import ApplicationProject from './ApplicationProject.jsx';
import IconButton from '../../components/common/IconButton/IconButton.jsx';
import Message from '../../components/common/Message/Message';
import Loading from '../../components/common/Loading/Loading.jsx';
import { iconStatus } from '../../constants/utils';
import { PROJECT_NAME } from '../../constants/validate';
import { versionTools } from '../../helpers/utils';
import {
  getUsersProjectList,
  getUserProjectInfo,
  patchUserProject,
  fetchMemberSuggestList,
  patchProjectMemeber,
  generateVersion,
  deleteProject,
  delProjectIcon,
  fetchAllVersions,
  compareProjectVersion,
  adjustBaseline,
  setSourcePath,
  getPathAndVersion,
  uploadIconToSource,
  saveToNewProject,
  createEmptyProject,
} from '../../actions/project';
import {
  submitPublicProject,
  publicProjectList,
} from '../../actions/notification';
import {
  getIconDetail,
  editIconStyle,
} from '../../actions/icon';
// import { resetIconSize } from '../../actions/repository';
import EditProject from './Edit.jsx';
import ManageMembers from './ManageMembers.jsx';
import Download from './Download.jsx';
import SetPath from './SetPath.jsx';
import Upload from './Upload.jsx';
import CreateProject from './CreateProject.jsx';

@connect(
  state => ({
    usersProjectList: state.project.usersProjectList,
    projectChangeInfo: state.project.projectChangeInfo,
    currentUserProjectInfo: state.project.currentUserProjectInfo,
    suggestList: state.project.memberSuggestList,
    projectInfo: state.project.projectInfo,
    comparisonResult: state.project.comparisonResult,
  }),
  {
    getUsersProjectList,
    getUserProjectInfo,
    patchUserProject,
    fetchMemberSuggestList,
    patchProjectMemeber,
    generateVersion,
    deleteProject,
    delProjectIcon,
    fetchAllVersions,
    compareProjectVersion,
    replace,
    getIconDetail,
    editIconStyle,
    adjustBaseline,
    setSourcePath,
    getPathAndVersion,
    uploadIconToSource,
    saveToNewProject,
    createEmptyProject,
    push,
    submitPublicProject,
    publicProjectList,
    // resetIconSize,
  }
)
class UserProject extends Component {
  static propTypes = {
    projectId: PropTypes.string,
    from: PropTypes.string,
    usersProjectList: PropTypes.array,
    projectChangeInfo: PropTypes.object,
    currentUserProjectInfo: PropTypes.object,
    getUsersProjectList: PropTypes.func,
    fetchMemberSuggestList: PropTypes.func,
    getUserProjectInfo: PropTypes.func,
    deleteProject: PropTypes.func,
    delProjectIcon: PropTypes.func,
    fetchAllVersions: PropTypes.func,
    compareProjectVersion: PropTypes.func,
    patchUserProject: PropTypes.func,
    patchProjectMemeber: PropTypes.func,
    editIconStyle: PropTypes.func,
    getIconDetail: PropTypes.func,
    // resetIconSize: PropTypes.func,
    suggestList: PropTypes.array,
    projectInfo: PropTypes.object,
    comparisonResult: PropTypes.object,
    generateVersion: PropTypes.func,
    replace: PropTypes.func,
    hideLoading: PropTypes.func,
    adjustBaseline: PropTypes.func,
    setSourcePath: PropTypes.func,
    getPathAndVersion: PropTypes.func,
    uploadIconToSource: PropTypes.func,
    saveToNewProject: PropTypes.func,
    createEmptyProject: PropTypes.func,
    submitPublicProject: PropTypes.func,
    publicProjectList: PropTypes.func,
    push: PropTypes.func,
    cacheProjectList: PropTypes.object,
  }

  static defaultProps ={
    generateVersion: 'revision',
    showLoading: false,
  }
  constructor(props) {
    super(props);
    this.state = {
      showEditProject: false,
      showManageMember: false,
      showSetPath: false,
      showGenerateVersion: false,
      showDownloadDialog: false,
      showUploadDialog: false,
      showCreateProject: false,
      isCreate: false,
      showHistoryVersion: false,
      isShowDownloadDialog: false,
      isShowUpdateDialog: false,
      isUploadSuccess: false,
      iconStr: '',
      generateVersion: 'revision',
      isShowLoading: false,
      loadIconOver: false,
      iconList: [],
      isPublicProject: false,
      publicId: '',
    };
    this.highestVersion = '0.0.0';
    this.nextVersion = '0.0.1';
    // source
    this.sourcePath = '';
    this.sourceVersion = '0.0.0';
    this.nextSourceVersion = '0.0.1';
  }
  componentWillMount() {
    this._isMounted = true;
    this.getPublicProject(2);
    this.setState({ showLoading: true });
    // this.props.resetIconSize();
    this.props.cacheProjectList.then(() => {
      const id = this.props.projectId;
      const current = this.props.currentUserProjectInfo;
      if (!current || id !== +current.id) {
        this.props.getUserProjectInfo(id)
          .then(() => this.props.fetchAllVersions(id))
          .then(() => {
            const { versions } = this.props.projectInfo;
            if (versions && versions.length) {
              this.compareVersion(() => {});
            }
          })
          .then(() => this.props.hideLoading())
          .catch(() => this.props.hideLoading());
        // this.props.fetchAllVersions(id);
      }
      this.props.fetchMemberSuggestList();
      this.setState({ showLoading: false });
    }).catch(() => this.setState({ showLoading: false }));
  }

  componentWillReceiveProps(nextProps) {
    this.getPublicProject(2);
    this.setState({ showLoading: true });
    const current = nextProps.currentUserProjectInfo;
    const nextId = nextProps.projectId;
    const from = this.props.from;
    const nextFrom = nextProps.from;
    if (current) {
      this.setState({
        name: current.name,
        id: current.id,
        owner: current.projectOwner,
        isPublic: current.public,
        members: current.members,
      });
    }

    if (!nextId && this.props.usersProjectList[0]) {
      this.props.replace(`/projects/${this.props.usersProjectList[0].id}`);
      return;
    }
    if (nextId !== this.props.projectId || from !== nextFrom) {
      this.props.getUserProjectInfo(nextId)
        .then(() => this.props.fetchAllVersions(nextId))
        .then(() => {
          const { versions } = this.props.projectInfo;
          if (versions && versions.length) {
            this.compareVersion(() => {});
          }
        })
        .then(() =>
          this.setState({ showLoading: false })
        )
        .catch(() => this.setState({ showLoading: false }));
      this.props.fetchAllVersions(nextId);
      this.highestVersion = '0.0.0';
      this.nextVersion = '0.0.1';
      // source
      this.sourcePath = '';
      this.sourceVersion = '0.0.0';
      this.nextSourceVersion = '0.0.1';
      this.props.compareProjectVersion(nextId, '0.0.0', '0.0.0');
    } else {
      this.setState({ showLoading: false });
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  setPublicProject(isShow) {
    const { isOwner } = this.props.currentUserProjectInfo;
    const { versions } = this.props.projectInfo;
    const versionTxt = '项目没有生成最新版本，不能申请公开项目。';
    const ownerTxt = '你不是项目负责人，不能申请公开项目。';
    const { length } = versions;
    // 没生成过版本 或者 版本为0.0.0 不允许生成项目
    if (!length || versions[length - 1] === '0.0.0') {
      Message.error(versionTxt);
      return false;
    }
    if (isOwner) {
      this.setState({
        isPublicProject: isShow,
      });
      return false;
    }
    Message.error(ownerTxt);
    return false;
  }

  // 公开项目列表
  getPublicProject(id) {
    this.props.publicProjectList(id)
      .then(data => {
        if (data.payload.data && data.payload.data[0]) {
          if (this._isMounted) {
            this.setState({
              publicId: data.payload.data[0].id,
            });
          }
        }
      });
  }

  @autobind
  getIconsDom() {
    return findDOMNode(this.refs.iconsContainer).getElementsByClassName('Icon');
  }

  @autobind
  updateIconInfo(iconId) {
    this.props.getIconDetail(iconId).then(() => {
      this.props.editIconStyle({ color: '#34475e', size: 255 });
      this.setState({
        isShowUpdateDialog: true,
      });
    });
  }

  @autobind
  closeUpdateDialog() {
    const fn = () => {
      this.setState({
        isShowUpdateDialog: false,
      });
    };
    const id = this.props.projectId;
    const current = this.props.currentUserProjectInfo;
    if (!current || id !== +current.id) {
      this.props.getUserProjectInfo(id)
        .then(() => fn())
        .catch(() => fn());
    }
  }

  @autobind
  updateProjectDetail(result) {
    this.props.patchUserProject({
      id: result.id,
      name: result.projectName,
      publicProject: result.isPublic,
      owner: result.owner.id,
    });
    this.shiftEidtProject();
  }
  @autobind
  shiftEidtProject(isShow = false) {
    this.setState({
      showEditProject: isShow,
    });
  }
  @autobind
  deleteProject() {
    confirm({
      content: '删除项目后无法恢复，请慎重操作！',
      title: '删除项目',
      onOk: () => {
        const { id } = this.props.currentUserProjectInfo;
        this.props.deleteProject({
          id,
        });
      },
      onCancel: () => {},
    });
  }

  @autobind
  deleteIcon(icons) {
    confirm({
      content: '确认从项目中删除图标吗？',
      title: '删除确认',
      onOk: () => {
        const id = this.props.currentUserProjectInfo.id;
        this.props.delProjectIcon(id, [icons])
        .then(() => this.props.getUserProjectInfo(id))
        .then(() => this.props.fetchAllVersions(id))
        .then(() => {
          const { versions } = this.props.projectInfo;
          if (versions && versions.length) {
            this.compareVersion(() => {});
          }
        });
      },
      onCancel: () => {},
    });
  }

  @autobind
  updateManageMembers({ members }) {
    this.props.patchProjectMemeber({
      id: this.props.currentUserProjectInfo.id,
      members,
    });
    this.shiftShowManageMembers();
  }
  @autobind
  shiftDownloadDialog(isShow = false) {
    const length = this.props.projectInfo.versions.length;
    const current = this.props.currentUserProjectInfo;
    if (current && current.icons) {
      const disabled = current.icons.filter(icon => icon.status === iconStatus.DISABLED);
      if (disabled.length) {
        Message.error('项目中存在系统占用的图标，请删除后再下载');
        return;
      }
    }
    if (isShow && length > 1) {
      this.compareVersion(ret => {
        const { deleted, added } = ret.payload.data;
        if (deleted.length || added.length) {
          this.setState({
            showDownloadDialog: isShow,
          });
        } else {
          this.downloadAllIcons();
          return;
        }
      });
    } else {
      this.setState({
        showDownloadDialog: isShow,
      });
    }
  }

  @autobind
  dialogDownloadShow(isShow) {
    this.setState({
      isShowDownloadDialog: isShow,
    });
  }

  @autobind
  dialogUpdateShow(isShow) {
    this.setState({
      isShowUpdateDialog: isShow,
    });
  }

  @autobind
  shiftShowManageMembers(isShow = false) {
    this.setState({
      showManageMember: isShow,
    });
  }
  @autobind
  changeGenerateVersion(e) {
    const type = e.currentTarget.querySelector('input').value;
    this.setState({
      generateVersion: type,
    });
  }

  @autobind
  downloadAllIcons() {
    const id = this.props.projectId;
    axios
      .post('/api/download/font', { type: 'project', id })
      .then(({ data }) => {
        if (data.res) {
          const { foldName } = data.data;
          window.location.href = `/download/${foldName}`;
        } else {
          Message.error(data.message || '下载失败，请稍后再试');
        }
      });
  }

  @autobind
  downloadAndGenerateVersion() {
    // 生成版本
    const id = this.props.currentUserProjectInfo.id;
    this.props.generateVersion({
      id,
      versionType: this.state.generateVersion,
    })
    .then((data) => {
      if (data.payload && !data.payload.res) {
        const { message } = data.payload.res || {};
        throw new Error(message || '生成版本失败');
      }
      // 生成新版后需要同步一下项目状态
      this.props.getUserProjectInfo(id);
    })
    .then(() => this.props.fetchAllVersions(id))
    .then(() => {
      const { versions } = this.props.projectInfo;
      if (versions && versions.length) {
        this.compareVersion(() => {});
      }
    })
    .then(() => {
      // 下载字体
      this.downloadAllIcons();
    })
    .catch(() => {
      //
    });
    // 关闭dialog
    this.shiftDownloadDialog();
  }

  @autobind
  shiftSetPath(isShow = false) {
    if (isShow) {
      this.props.getUserProjectInfo(this.props.projectId);
    }
    this.setState({
      showSetPath: isShow,
    });
  }

  @autobind
  updateSourcePath(data) {
    const oldPath = this.props.currentUserProjectInfo && this.props.currentUserProjectInfo.source;
    const newPath = data && data.sourcePath;
    if (decodeURIComponent(oldPath) === newPath) {
      this.shiftSetPath();
      return;
    }
    this.props.setSourcePath(data).then(result => {
      if (result.payload && result.payload.res) {
        const id = this.props.currentUserProjectInfo.id;
        this.props.getUserProjectInfo(id);
        this.shiftSetPath();
      }
    });
  }

  @autobind
  shiftUploadSource(isShow = false) {
    const id = this.props.currentUserProjectInfo.id;
    const current = this.props.currentUserProjectInfo;
    if (current && current.icons) {
      const disabled = current.icons.filter(icon => icon.status === iconStatus.DISABLED);
      if (disabled.length) {
        Message.error('项目中存在系统占用的图标，请删除后再同步');
        return;
      }
    }
    if (isShow) {
      this.props.getPathAndVersion(id).then(data => {
        if (!data.payload.res) return;
        const val = data.payload.data;
        this.sourcePath = val && val.source;
        this.compareVersion((ret) => {
          const { deleted, added } = ret.payload.data;
          const v = val && val.version;
          const sourceNum = versionTools.v2n(v);
          const platformNum = versionTools.v2n(this.highestVersion);
          if (sourceNum && platformNum && sourceNum === platformNum
          && !deleted.length && !added.length) {
            Message.error('线上最新版项目图标与当前项目图标一致，无需进行图标同步');
            return;
          }
          this.sourceVersion = sourceNum > platformNum ? v : this.highestVersion;
          this.setState({ showUploadDialog: isShow });
        });
      });
    } else {
      this.setState({ showUploadDialog: isShow });
    }
  }

  @autobind
  shiftUploadSuccess(isShow = false) {
    this.setState({
      isUploadSuccess: isShow,
    });
  }

  @autobind
  shiftPublickProject(isShow = false, data) {
    if (data) {
      this.submitProject(data);
    }
    this.setPublicProject(isShow);
  }

  submitProject(data) {
    this.props.submitPublicProject(data)
      .then(result => {
        const obj = result.payload.data;
        if (obj.error) {
          Message.error('该项目已申请为公开项目, 不能重复申请!');
        }
        if (obj.length) {
          Message.success('已申请为公开项目, 请等待审核!');
        }
      });
  }

  @autobind
  uploadAndGenerateVersion() {
    this.setState({ isShowLoading: true });
    // 生成(指定)版本
    const { id, name, source } = this.props.currentUserProjectInfo;
    this.props.generateVersion({
      id,
      versionType: this.state.generateVersion,
      // 指定升级到的版本
      version: this.nextSourceVersion,
    })
    .then((data) => {
      if (data.payload && !data.payload.res) {
        throw Error();
      }
      // 上传字体
      this.props.fetchAllVersions(id);
      return this.props.uploadIconToSource(id, {
        project: name,
        path: decodeURIComponent(source),
        branch: 'master',
        version: this.nextSourceVersion,
      });
    })
    .then((val) => {
      const { res, data } = val.payload;
      if (res && data) {
        this.shiftUploadSource();
        this.shiftUploadSuccess(true);
        this.setState({ iconStr: data });
      }
      this.setState({ isShowLoading: false });
    })
    .then(() => {
      // 生成新版后需要同步一下项目状态
      this.props.getUserProjectInfo(id);
    })
    .then(() => {
      const { versions } = this.props.projectInfo;
      if (versions && versions.length) {
        this.compareVersion(() => {});
      }
    })
    .catch(() => {
      this.setState({ isShowLoading: false });
    });
    // 关闭dialog
    this.shiftUploadSource();
  }

  @autobind
  shiftCreateProject(isShow = false, isCreate = false) {
    if (this._isMounted) {
      this.setState({
        showCreateProject: isShow,
        isCreate,
      });
    }
  }

  @autobind
  createProject(value) {
    const { projectName } = value;
    if (!PROJECT_NAME.reg.test(projectName)) {
      Message.error(PROJECT_NAME.message);
      return;
    }
    const current = this.props.currentUserProjectInfo;
    let icons = [];
    if (this.state.isCreate) {
      this.props.createEmptyProject({ name: projectName }).then(result => {
        const { res, data } = result && result.payload;
        if (!res) {
          return;
        }
        const { id } = data;
        this.props.push(`/projects/${id}`);
        this.shiftCreateProject();
      }).catch(() => {
        this.shiftCreateProject();
      });
    } else {
      icons = current && current.icons || [];
      this.props.saveToNewProject(projectName, icons).then(result => {
        const { res, data } = result && result.payload;
        if (!res) {
          return;
        }
        const { projectId } = data;
        this.props.push(`/projects/${projectId}`);
        this.shiftCreateProject();
      }).catch(() => {
        this.shiftCreateProject();
      });
    }
  }

  @autobind
  adjustBaseline() {
    const { projectId, currentUserProjectInfo } = this.props;
    this.props.adjustBaseline(projectId, currentUserProjectInfo.baseline);
  }

  resumeIconList() {
    this.setState({
      iconList: false,
    });
  }

  @autobind
  handleSingleIconDownload(iconId) {
    return () => {
      this.props.getIconDetail(iconId).then(() => {
        this.props.editIconStyle({ color: '#34475e', size: 256 });
        this.setState({
          isShowDownloadDialog: true,
        });
      });
    };
  }

  @autobind
  compareVersion(callback) {
    const id = this.props.projectId;
    const versions = this.props.projectInfo.versions;
    const high = versions[versions.length - 1];
    const low = '0.0.0';
    this.highestVersion = high;
    this.props.compareProjectVersion(id, high, low).then(callback);
  }

  addDiv() {
    if (!this.state.loadIconOver) {
      const body = document.querySelector('body');
      const bodyHeight = body.offsetHeight;
      const scrollHeight = body.scrollTop;
      const appHeight = document.querySelector('#app').offsetHeight;
      if ((bodyHeight + scrollHeight) >= (appHeight - 50)) {
        this.setState({
          loadIconOver: true,
        }, () => {
          this.renderIconList();
        });
      }
    }
  }

  @autobind
  renderIconList() {
    const current = this.props.currentUserProjectInfo;
    if (!current) return null;
    const { deleted, added, replaced } = this.props.comparisonResult;
    let iconList = (
      <div className="no-icon">
        <div className="no-icon-pic"></div>
        <div className="no-icon-tips">
          <p>还没有图标</p>
          <p>快从购物车添加吧</p>
        </div>
      </div>
    );
    if (current.icons && current.icons.length > 0) {
      const hasReplacedIcons = replaced.map(item => item.old && item.old.id);
      const replacedIcons = replaced.map(item => item.new && item.new.id);
      const deletedIcons =
        deleted.map(item => item.id).filter(item => hasReplacedIcons.indexOf(item) === -1);
      const addedIcons =
        added.map(item => item.id).filter(item => replacedIcons.indexOf(item) === -1);

      const currentIcons = deletedIcons && deletedIcons.length
        ? current.icons.concat(deleted.filter(item => deletedIcons.indexOf(item.id) > -1))
        : current.icons;
      iconList = currentIcons.map((item, index) => {
        const deletedClassName = deletedIcons.indexOf(item.id) > -1 ? 'deleted-icon' : '';
        const addedClassName = addedIcons.indexOf(item.id) > -1 ? 'added-icon' : '';
        const replacedClassName = replacedIcons.indexOf(item.id) > -1 ? 'replaced-icon' : '';
        const disabledClassName = item.status === iconStatus.DISABLED ? 'disabled-icon' : '';
        const toolBtns = ['copy', 'download', 'copytip', 'update'];
        if (!deletedClassName) {
          toolBtns.push('delete');
        }
        return (
          <div
            key={index}
            className={`project-icon clearfix ${disabledClassName} ${deletedClassName}`}
          >
            <ul className="status-tag">
              <li className={`status-tag-item ${disabledClassName}`}>系统占用</li>
              <li className={`status-tag-item ${addedClassName}`}>新增</li>
              <li className={`status-tag-item ${replacedClassName}`}>已替换</li>
              <li className={`status-tag-item ${deletedClassName}`}>删除</li>
            </ul>
            <IconButton
              icon={item}
              toolBtns={toolBtns}
              delete={(icons) => {
                this.deleteIcon(icons);
              }}
              update={() => { this.updateIconInfo(item.id); }}
              download={this.handleSingleIconDownload(item.id)}
            />
          </div>
        );
      });
    }
    return iconList;
  }
  renderDialogList() {
    const current = this.props.currentUserProjectInfo;
    let dialogList = null;
    const url = this.state.iconStr;
    const template = `@font-face {
  font-family: 'iconfont';
  src: url('${url}.eot'); /* IE9*/
  src: url('${url}.woff') format('woff'), /* chrome、firefox */
  url('${url}.ttf') format('truetype'), /* chrome、firefox、opera、Safari, Android, iOS 4.2+*/
  url('${url}.svg#iconfont') format('svg'); /* iOS 4.1- */
}`;
    this.nextVersion = versionTools.update(this.highestVersion, this.state.generateVersion);
    this.nextSourceVersion = versionTools.update(this.sourceVersion, this.state.generateVersion);
    if (current.name) {
      dialogList = [
        <EditProject
          key={1}
          projectName={current.name}
          owner={current.projectOwner}
          isPublic={+current.public}
          members={current.members}
          id={current.id}
          onOk={this.updateProjectDetail}
          onCancel={this.shiftEidtProject}
          showEditProject={this.state.showEditProject}
          ref={
            (node) => {
              this.EditProjectEle = node;
            }
          }
        />,
        <ManageMembers
          key={2}
          showManageMember={this.state.showManageMember}
          onChange={this.props.fetchMemberSuggestList}
          onOk={this.updateManageMembers}
          onCancel={this.shiftShowManageMembers}
          suggestList={this.props.suggestList}
          members={current.members}
          owner={current.projectOwner}
          id={current.id}
          ref={
            (node) => {
              this.ManageMembersEle = node;
            }
          }
        />,
        <SetPath
          key={3}
          projectName={current.name}
          sourcePath={decodeURIComponent(current.source || '')}
          id={current.id}
          onOk={this.updateSourcePath}
          onCancel={this.shiftSetPath}
          showSetPath={this.state.showSetPath}
          ref={
            (node) => {
              this.SetPathEle = node;
            }
          }
        />,
        <Upload
          key={4}
          currenthighestVersion={this.sourceVersion}
          nextVersion={this.nextSourceVersion}
          comparison={this.props.comparisonResult}
          onOk={this.uploadAndGenerateVersion}
          onCancel={this.shiftUploadSource}
          onChange={this.changeGenerateVersion}
          value={this.state.generateVersion}
          confrimText={'生成版本并上传'}
          showUploadDialog={this.state.showUploadDialog}
          sourcePath={decodeURIComponent(current.source || '')}
        />,
        <Download
          key={5}
          currenthighestVersion={this.highestVersion}
          nextVersion={this.nextVersion}
          comparison={this.props.comparisonResult}
          onOk={this.downloadAndGenerateVersion}
          onCancel={this.shiftDownloadDialog}
          onChange={this.changeGenerateVersion}
          value={this.state.generateVersion}
          confrimText={'生成版本并下载'}
          showDownloadDialog={this.state.showDownloadDialog}
        />,
        <Dialog
          key={6}
          empty
          visible={this.state.isShowDownloadDialog}
          getShow={this.dialogDownloadShow}
        >
          <DownloadDialog />
        </Dialog>,
        <Dialog
          key={7}
          title="查看在线链接（支持点击内容进行复制）"
          visible={this.state.isUploadSuccess}
          getShow={this.shiftUploadSuccess}
          onOk={() => { this.shiftUploadSuccess(); }}
          onCancel={() => { this.shiftUploadSuccess(); }}
        >
          <ClipboardButton
            className={"copy-source-addr"}
            button-title="复制在线链接"
            data-clipboard-text={template}
            onSuccess={() => {
              Message.success('复制成功！');
            }}
            onError={() => {
              Message.error('复制出错了，请稍后重试或手动复制下吧！');
            }}
          >
            <pre>{template}</pre>
          </ClipboardButton>
          <div style={{ marginTop: 14, color: '#666' }}>* 注：移动端只需引用 woff 和 ttf 格式字体</div>
        </Dialog>,
        <CreateProject
          key={8}
          id={current.id}
          onOk={this.createProject}
          onCancel={this.shiftCreateProject}
          isCreate={this.state.isCreate}
          showCreateProject={this.state.showCreateProject}
        />,
        <Dialog
          key={9}
          empty
          visible={this.state.isShowUpdateDialog}
          getShow={this.dialogUpdateShow}
        >
          <UpdateDialog closeUpdateDialog={this.closeUpdateDialog} />
        </Dialog>,
        <ApplicationProject
          key={10}
          empty
          title="申请公开项目"
          visible={this.state.isPublicProject}
          getShow={this.shiftUploadSuccess}
          onOk={(isShow, data) => { this.shiftPublickProject(isShow, data); }}
          onCancel={() => { this.shiftPublickProject(); }}
        />,
      ];
    }
    return dialogList;
  }

  render() {
    const list = this.props.usersProjectList;
    const current = this.props.currentUserProjectInfo;
    const id = this.props.projectId;
    const versions = this.props.projectInfo.versions;
    const len = versions && versions.length;
    const iconList = this.renderIconList();
    const dialogList = this.renderDialogList();
    const owner = current.projectOwner || { name: '' };
    const { isSupportSource } = current;
    const { publicId } = this.state;

    return (
      <div className="UserProject">
        <SubTitle tit="我的图标项目">
          <SliderSize getIconsDom={this.getIconsDom} />
        </SubTitle>
        <Content>
          <Menu>
            <li
              className={`project-name-item ${!list.length
                ? 'selected'
                : null}`
              }
              onClick={() => { this.shiftCreateProject(true, true); }}
            >
              <a>
                <i className="iconfont" style={{ marginTop: -3, fontWeight: 700 }}>&#xf470;</i>
                新建图标项目
              </a>
            </li>
            <li>
              <Link to={`/projectlist/${publicId}`}>
                公开项目
              </Link>
            </li>
            {
              list.map((item, index) => {
                const infoCount = + this.props.projectChangeInfo[`project${item.id}`];
                return (
                  <li
                    key={index}
                    data-id={item.id}
                    // title={item.name}
                    title={infoCount ? `该项目有${infoCount < 100 ? infoCount : '99+'}条变更，请仔细查看` : ''}
                    className={`project-name-item ${item.id === this.props.currentUserProjectInfo.id
                      ? 'selected'
                      : null}`
                    }
                  >
                    <Link
                      to={`/projects/${item.id}`}
                    >
                        {item.name}
                    </Link>
                    {infoCount ?
                      (<span className="info-num">
                        {infoCount < 100 ? infoCount : '···'}
                      </span>)
                      : null
                    }
                  </li>
                );
              })
            }
          </Menu>
          <Main>
            <div className="UserProject-info">
              <header className="clearfix">
                <h3>{current.name}</h3>
                <div className="powerby">负责人：{owner.name}</div>
                <div className="version">
                  {versions.length > 1 ? `版本：${versions[len - 1]}` : ''}
                </div>
              </header>
              {current.isOwner ?
                <menu className="options">
                  <span
                    className="edit"
                    onClick={() => {
                      this.shiftEidtProject(true);
                    }}
                  >
                    编辑项目
                  </span>
                  <span className="delete" onClick={this.deleteProject}>删除项目</span>
                  <span
                    className="team-member"
                    onClick={() => {
                      this.shiftShowManageMembers(true);
                    }}
                  >
                    管理项目成员
                  </span>
                  {isSupportSource ?
                    <span onClick={() => { this.shiftSetPath(true); }}>配置source路径</span> :
                    null
                  }
                  <span onClick={() => { this.setPublicProject(true); }}>申请公开项目</span>
                  <span
                    onClick={this.adjustBaseline}
                    title="调整基线后，图标将向下偏移，更适合跟中、英文字体对齐"
                    className="baseline-adjust"
                  >
                    {!current.baseline ?
                      <i className="iconfont">&#xf35f;</i> :
                      <i className="iconfont">&#xf496;</i>
                    }
                    调整基线
                  </span>
                </menu>
              : null
              }
              <div className="tool">
                <button
                  className="options-btns btns-blue"
                  onClick={() => { this.shiftDownloadDialog(true); }}
                >
                  <i className="iconfont">&#xf50b;</i>
                  下载全部图标
                </button>
                {isSupportSource ?
                  <button
                    className="options-btns btns-default"
                    onClick={() => { this.shiftUploadSource(true); }}
                  >
                    同步source
                  </button>
                : null
                }
                <button
                  className="options-btns btns-default"
                  onClick={() => { this.shiftCreateProject(true); }}
                >
                  拷贝项目
                </button>
                <Link
                  to={`/projects/${id}/logs`}
                  className="options-btns btns-default"
                >
                  操作日志
                </Link>
                <Link
                  to={`/projects/${id}/history`}
                  className={
                    `options-btns btns-default ${versions.length <= 1 ? 'btn-history-hidden' : ''}`
                  }
                >
                  历史版本
                </Link>
              </div>
            </div>
            <div className="clearfix icon-list" ref="iconsContainer">
              {iconList}
            </div>
          </Main>
        </Content>
        {dialogList}
        <Loading visible={this.state.isShowLoading} />
      </div>
    );
  }
}
export default UserProject;
